// Every model call the runner makes goes through the codex CLI: short reads of a captured page into JSON, and the long
// build sessions that turn listing photos into models and textures.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!Bun.which('codex')) throw new Error('codex CLI not found on PATH');

// Pinned so the runner doesn't follow whatever model the Mac's own Codex config picks.
export const CODEX_MODEL = 'gpt-6.1-terra';

export async function codex(args: string[], prompt: string, env?: Record<string, string>) {
	const proc = Bun.spawn(['codex', 'exec', '-m', CODEX_MODEL, '--skip-git-repo-check', '--ephemeral', ...args, '-'], {
		stdin: new Blob([prompt]),
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, ...env },
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { out, err, code };
}

// A single answer shaped by `schema`, from the prompt alone. The user config is skipped so its MCP servers don't start
// for a call that runs no tools.
export async function codexStructured<T>(prompt: string, schema: object): Promise<T> {
	const work = await mkdtemp(join(tmpdir(), 'codex-parse-'));
	try {
		await Bun.write(join(work, 'schema.json'), JSON.stringify(schema));
		const { out, err, code } = await codex(
			[
				'--ignore-user-config',
				'--ignore-rules',
				'-c',
				'model_reasoning_effort="low"',
				'-c',
				'web_search="disabled"',
				'-s',
				'read-only',
				'-C',
				work,
				'--output-schema',
				join(work, 'schema.json'),
				'-o',
				join(work, 'answer.json'),
			],
			`${prompt}\n\nAnswer from this input alone, without running any commands.`,
		);
		if (code !== 0) throw new Error(`codex exited ${code}: ${(err || out).slice(-1500)}`);
		const answer = await Bun.file(join(work, 'answer.json'))
			.text()
			.catch(() => '');
		try {
			return JSON.parse(answer);
		} catch {
			throw new Error(`codex answered no JSON: ${answer.slice(0, 500) || (err || out).slice(-500)}`);
		}
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}
