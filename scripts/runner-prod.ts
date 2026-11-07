// The job runner against production: what makes imports and builds pasted on apartment.stf.lol or in the AR app run.
import { join } from 'node:path';
import { readEnv } from './lib';

const runner = Bun.spawn(['bun', join(import.meta.dir, '../apps/runner/src/index.ts')], {
	env: { ...process.env, ...readEnv('prod') },
	stdio: ['inherit', 'inherit', 'inherit'],
});
process.on('SIGINT', () => runner.kill('SIGINT'));
process.on('SIGTERM', () => runner.kill('SIGTERM'));
process.exit(await runner.exited);
