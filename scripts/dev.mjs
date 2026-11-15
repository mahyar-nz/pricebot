import { spawn } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 500).unref();
}
for (const name of ['@pricing/api', '@pricing/web']) {
  const child = spawn(pnpm, ['--filter', name, 'dev'], {
    stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, PORT: name === '@pricing/web' ? '3000' : process.env.API_PORT || '4000' }
  });
  children.push(child);
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
