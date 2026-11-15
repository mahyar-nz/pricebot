import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  secret: process.env.SESSION_SECRET ?? '',
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  production: process.env.NODE_ENV === 'production',
  port: Number(process.env.API_PORT ?? 4000),
};
export function validateEnvironment(): void {
  if (!env.databaseUrl) throw new Error('DATABASE_URL is required');
  if (env.secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  if (Buffer.from(env.encryptionKey, 'base64').length !== 32) throw new Error('ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  if (env.production && !env.origin.startsWith('https://')) throw new Error('WEB_ORIGIN must use HTTPS in production');
  if (env.production && process.env.SMS_PROVIDER === 'test') throw new Error('Test SMS provider is forbidden in production');
}
