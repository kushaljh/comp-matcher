// Runs a .sql file against SUPABASE_DB_URL (from .env). psql substitute for
// this Windows box: multi-statement simple-query protocol, NOTICEs printed,
// non-zero exit on any SQL error.
// Usage: node scripts/run-sql.mjs <path-to-sql-file>
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/run-sql.mjs <file.sql>');
  process.exit(2);
}
// Strip psql meta-commands (\set, \echo, ...) — not understood by the server.
// Errors already stop execution here, and \echo payloads are printed at the end.
const raw = readFileSync(resolve(root, file), 'utf8');
const echoes = [];
const sql = raw
  .split(/\r?\n/)
  .filter((line) => {
    const meta = line.match(/^\s*\\(\w+)\s*(.*)$/);
    if (!meta) return true;
    if (meta[1] === 'echo') echoes.push(meta[2].replace(/^'|'$/g, ''));
    return false;
  })
  .join('\n');

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
client.on('notice', (n) => console.log(`NOTICE: ${n.message}`));

try {
  await client.connect();
  await client.query(sql);
  for (const msg of echoes) console.log(msg);
  console.log(`OK: ${file}`);
} catch (err) {
  console.error(`FAILED: ${file}\n${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
