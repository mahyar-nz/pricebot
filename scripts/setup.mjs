import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = resolve(root, '.env');
if (existsSync(env)) {
  console.log('.env already exists; existing settings preserved.');
} else {
  const password = randomBytes(24).toString('hex');
  writeFileSync(env, `NODE_ENV=development\nDATABASE_URL=postgresql://pricing:${password}@127.0.0.1:54329/pricing\nPOSTGRES_USER=pricing\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=pricing\nPOSTGRES_PORT=54329\nAPI_PORT=4000\nPORT=4000\nWEB_ORIGIN=http://localhost:3000\nAPI_URL=http://localhost:4000\nSESSION_SECRET=${randomBytes(48).toString('base64url')}\nENCRYPTION_KEY=${randomBytes(32).toString('base64')}\nREDIS_URL=redis://127.0.0.1:6379\nSMS_PROVIDER=disabled\nPAYMENT_PROVIDER=disabled\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created local .env with random secrets. SMS and payments are disabled.');
}
mkdirSync(resolve(root, '.local'), { recursive: true });
console.log('Next: pnpm db:local (separate terminal), then pnpm db:generate && pnpm db:migrate && pnpm db:seed.');
