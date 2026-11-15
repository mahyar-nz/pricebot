import { existsSync, cpSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(resolve(root, '.env'));
if (process.env.NODE_ENV === 'production') throw new Error('Local database helper is development-only.');
const databaseDir = resolve(root, '.local', 'postgres');
const databaseName = process.env.POSTGRES_DB || 'pricing';
if (!/^[a-z_][a-z0-9_]*$/.test(databaseName)) throw new Error('Invalid local database name');
const options = {
  databaseDir,
  user: process.env.POSTGRES_USER || 'pricing',
  password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT || 54329),
  authMethod: 'scram-sha-256',
  persistent: true,
  autoRehydrateSymlinks: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: line => { if (/FATAL|ERROR|PANIC/.test(String(line))) console.error(String(line)); }
};
if (!options.password || options.password === 'CHANGE_ME') throw new Error('Run pnpm setup first.');
let database;
if (process.platform === 'win32') {
  // PostgreSQL's Windows tools do not consistently support long pnpm paths.
  const require = createRequire(import.meta.url);
  const embeddedRequire = createRequire(require.resolve('embedded-postgres'));
  const nativeSource = resolve(dirname(embeddedRequire.resolve('@embedded-postgres/windows-x64')), '../native');
  const native = resolve(root, '.local', 'pg-runtime');
  if (!existsSync(resolve(native, 'bin', 'pg_ctl.exe'))) cpSync(nativeSource, native, { recursive: true });
  const run = (binary, args) => execFileSync(resolve(native, 'bin', binary + '.exe'), args, { windowsHide: true, stdio: 'ignore' });
  database = {
    async initialise() {
      const passwordFile = resolve(root, '.local', 'init-password');
      writeFileSync(passwordFile, options.password, { mode: 0o600 });
      try { run('initdb', ['-D', databaseDir, '-U', options.user, '--pwfile=' + passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']); }
      finally { unlinkSync(passwordFile); }
    },
    async start() { try { run('pg_ctl', ['-D', databaseDir, 'status']); return; } catch {} run('pg_ctl', ['-D', databaseDir, '-l', resolve(root, '.local', 'postgres.log'), '-o', `-h 127.0.0.1 -p ${options.port}`, '-w', 'start']); },
    async stop() { run('pg_ctl', ['-D', databaseDir, '-m', 'fast', '-w', 'stop']); }
  };
} else database = new EmbeddedPostgres(options);
if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await database.initialise();
await database.start();
const client = new pg.Client({ host: '127.0.0.1', port: options.port, user: options.user, password: options.password, database: 'postgres' });
await client.connect();
const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
if (!exists.rowCount) await client.query(`CREATE DATABASE "${databaseName}"`);
await client.end();
console.log(`Local PostgreSQL ready at 127.0.0.1:${options.port}/${databaseName}. Data persists in .local/postgres.`);
console.log('Keep this terminal running; Ctrl+C stops this database without deleting data.');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await database.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60_000);

