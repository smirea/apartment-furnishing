// Keeps `bun run runner:prod` running whenever this Mac is logged in, as a LaunchAgent, so imports and builds pasted
// on apartment.stf.lol or in the AR app run without a terminal open.
//
//   bun scripts/runner-service.ts install     (re)writes and starts the agent, from this checkout
//   bun scripts/runner-service.ts uninstall   stops and removes it
//   bun scripts/runner-service.ts status
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { run } from './lib';

const LABEL = 'lol.stf.apartment-runner';
const PLIST = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const LOG = join(homedir(), 'Library/Logs/apartment-runner.log');
const ROOT = join(import.meta.dir, '..');
const domain = `gui/${process.getuid!()}`;

const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function install() {
	// The jobs shell out to grok, codex, uv, pdftotext and Apple's USD tools, found on this shell's PATH.
	const path = (process.env.PATH ?? '')
		.split(':')
		.filter(dir => !dir.endsWith('node_modules/.bin'))
		.join(':');
	writeFileSync(
		PLIST,
		`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array><string>${escape(process.execPath)}</string><string>scripts/runner-prod.ts</string></array>
	<key>WorkingDirectory</key><string>${escape(ROOT)}</string>
	<key>EnvironmentVariables</key>
	<dict><key>PATH</key><string>${escape(path)}</string></dict>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>ThrottleInterval</key><integer>30</integer>
	<key>StandardOutPath</key><string>${escape(LOG)}</string>
	<key>StandardErrorPath</key><string>${escape(LOG)}</string>
</dict>
</plist>
`,
	);
	run(['launchctl', 'bootout', `${domain}/${LABEL}`], { allowFail: true });
	run(['launchctl', 'bootstrap', domain, PLIST]);
	console.log(`Started ${LABEL} from ${ROOT}; logs in ${LOG}`);
}

function uninstall() {
	run(['launchctl', 'bootout', `${domain}/${LABEL}`], { allowFail: true });
	if (existsSync(PLIST)) rmSync(PLIST);
	console.log(`Removed ${LABEL}`);
}

function status() {
	console.log(
		run(['launchctl', 'print', `${domain}/${LABEL}`], { allowFail: true })
			.split('\n')
			.slice(0, 12)
			.join('\n') || 'Not installed',
	);
}

const commands: Record<string, () => void> = { install, uninstall, status };
const command = commands[process.argv[2] ?? ''];
if (!command) {
	console.error(`Usage: bun scripts/runner-service.ts <${Object.keys(commands).join('|')}>`);
	process.exit(1);
}
command();
