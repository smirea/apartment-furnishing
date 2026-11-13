// Runs the production job runner on the Mac mini (`ssh mini`) as a LaunchAgent, so imports and builds pasted on
// apartment.stf.lol or in the AR app run whether or not the laptop is awake. Run it from any machine that can `ssh mini`:
//
//   bun scripts/runner-service.ts setup      installs what the jobs need, checks out master and (re)starts the agent;
//                                            rerun it to ship runner changes
//   bun scripts/runner-service.ts teardown   stops and removes the agent and its checkout
//   bun scripts/runner-service.ts status     the agent's state and the end of its log
import { spawnSync } from 'node:child_process';

const HOST = 'mini';
const LABEL = 'lol.stf.apartment-runner';
const REPO = 'git@github.com:smirea/apartment-furnishing.git';
// A checkout of its own on master, so the runner never picks up a branch someone is working on.
const CHECKOUT = '$HOME/code/apartment-furnishing';
const PLIST = `$HOME/Library/LaunchAgents/${LABEL}.plist`;
const LOG = '$HOME/Library/Logs/apartment-runner.log';
// launchd gives the agent only this PATH. codex is a node script, and the import and build jobs shell out to uv,
// pdftotext and Apple's USD tools.
const PATH = '$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const TOOLS = ['bun', 'node', 'codex', 'uv', 'pdftotext', 'usdextract', 'usdzip', 'env-manager', 'git'];

const PRELUDE = `set -euo pipefail
export PATH="${PATH}"
fail() { echo "$*" >&2; exit 1; }
domain="gui/$(id -u)"
# bootout returns before the agent is gone, and bootstrapping it again meanwhile fails with an I/O error.
stop_agent() {
	launchctl bootout "$domain/${LABEL}" 2>/dev/null || true
	for _ in $(seq 50); do launchctl print "$domain/${LABEL}" >/dev/null 2>&1 || return 0; sleep 0.2; done
	fail "${LABEL} is still loaded 10 s after bootout"
}
`;

const SETUP = `${PRELUDE}
launchctl print "$domain" >/dev/null 2>&1 || fail "nobody is logged in to ${HOST}'s desktop, which a LaunchAgent needs"

command -v pdftotext >/dev/null || brew install poppler
for bin in ${TOOLS.join(' ')}; do command -v "$bin" >/dev/null || fail "$bin is not on the agent's PATH ($PATH)"; done
codex login status >/dev/null 2>&1 || fail "codex is signed out on ${HOST}: ssh ${HOST}, then run codex login --device-auth"

if [ -d "${CHECKOUT}/.git" ]; then
	git -C "${CHECKOUT}" fetch -q origin master
	git -C "${CHECKOUT}" checkout -q master
	git -C "${CHECKOUT}" merge -q --ff-only origin/master || fail "${CHECKOUT} has commits master lacks"
else
	git clone -q --branch master "${REPO}" "${CHECKOUT}"
fi
cd "${CHECKOUT}"
echo "${HOST}: master at $(git log -1 --format='%h %s')"
bun install --frozen-lockfile >/dev/null
# Product pages are captured with Camoufox, whose browser downloads on first use.
uv run -q -p 3.12 --with 'camoufox[geoip]' python -m camoufox fetch >/dev/null

mkdir -p "$(dirname "${PLIST}")" "$(dirname "${LOG}")"
cat > "${PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array><string>$(command -v bun)</string><string>scripts/runner-prod.ts</string></array>
	<key>WorkingDirectory</key><string>${CHECKOUT}</string>
	<key>EnvironmentVariables</key>
	<dict><key>PATH</key><string>$PATH</string></dict>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>ThrottleInterval</key><integer>30</integer>
	<key>StandardOutPath</key><string>${LOG}</string>
	<key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
PLIST
plutil -lint -s "${PLIST}"

stop_agent
: > "${LOG}"
launchctl bootstrap "$domain" "${PLIST}"
for _ in $(seq 60); do
	if grep -q 'runner: claiming jobs' "${LOG}"; then echo "${HOST}: ${LABEL} is claiming jobs; log in ${LOG}"; exit 0; fi
	sleep 1
done
tail -n 30 "${LOG}" >&2
fail "${LABEL} did not start claiming jobs within 60 s"
`;

const TEARDOWN = `${PRELUDE}
stop_agent
rm -f "${PLIST}"
[ -e "${LOG}" ] && trash "${LOG}"
[ -e "${CHECKOUT}" ] && trash "${CHECKOUT}"
echo "${HOST}: removed ${LABEL} and ${CHECKOUT}"
`;

const STATUS = `${PRELUDE}
launchctl print "$domain/${LABEL}" 2>/dev/null | grep -E '^[[:space:]]*(state|pid|last exit code|runs) =' || echo "${LABEL} is not installed"
if [ -e "${LOG}" ]; then tail -n 15 "${LOG}"; fi
`;

function remote(script: string) {
	// The mini's ssh config entry opens an interactive login shell, which a script piped to bash can't use.
	const result = spawnSync('ssh', ['-o', 'RemoteCommand=none', '-o', 'RequestTTY=no', HOST, 'bash', '-s'], {
		input: script,
		stdio: ['pipe', 'inherit', 'inherit'],
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}

const commands: Record<string, string> = { setup: SETUP, teardown: TEARDOWN, status: STATUS };
const script = commands[process.argv[2] ?? ''];
if (!script) {
	console.error(`Usage: bun scripts/runner-service.ts <${Object.keys(commands).join('|')}>`);
	process.exit(1);
}
remote(script);
