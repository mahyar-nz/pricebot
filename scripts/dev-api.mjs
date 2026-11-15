import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Compile with TypeScript: Nest requires emitted decorator metadata.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = resolve(root, 'apps/api');
const core = resolve(root, 'packages/core');
const compiler = resolve(root, 'node_modules/typescript/bin/tsc');
for (const cwd of [core, api]) {
  const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json'], { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const children = [
  spawn(process.execPath, [compiler, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { cwd: core, stdio: 'inherit' }),
  spawn(process.execPath, [compiler, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { cwd: api, stdio: 'inherit' }),
  spawn(process.execPath, ['--watch', '--watch-preserve-output', 'dist/main.js'], { cwd: api, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 500).unref();
}
children.forEach(child => { child.on('error', () => stop(1)); child.on('exit', code => { if (!stopping) stop(code ?? 1); }); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
