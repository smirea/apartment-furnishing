import { createDb, type Row, type Sql } from '@repo/shared/db';
import { env } from 'cloudflare:workers';

export const d1 =
	(database: D1Database): Sql =>
	async statements =>
		(await database.batch(statements.map(s => database.prepare(s.sql).bind(...s.params)))).map(r => r.results as Row[]);

export const db = createDb(d1(env.DB));
