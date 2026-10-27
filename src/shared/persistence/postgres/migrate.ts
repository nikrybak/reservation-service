import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'kysely';
import { KyselyDatabase } from './kysely-database';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations');

/** Applies plain SQL migrations in lexical order, each in its own transaction. */
export async function migrate(
  database: KyselyDatabase,
  log: (line: string) => void,
): Promise<void> {
  const db = database.root;
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`.execute(db);

  const applied = await sql<{ name: string }>`SELECT name FROM schema_migrations`.execute(db);
  const done = new Set(applied.rows.map((row) => row.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files.filter((name) => !done.has(name))) {
    const statement = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    await db.transaction().execute(async (trx) => {
      await sql.raw(statement).execute(trx);
      await sql`INSERT INTO schema_migrations (name) VALUES (${file})`.execute(trx);
    });
    log(`applied ${file}`);
  }
}

if (require.main === module) {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL is required\n');
    process.exit(1);
  }
  const database = KyselyDatabase.connect(databaseUrl);
  migrate(database, (line) => process.stdout.write(`${line}\n`))
    .then(() => database.close())
    .catch(async (error: unknown) => {
      process.stderr.write(`migration failed: ${String(error)}\n`);
      await database.close();
      process.exit(1);
    });
}
