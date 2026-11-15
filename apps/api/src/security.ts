import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { env } from './env.js';

export const PASSWORD_MIN_LENGTH = 12;
const SCRYPT_N = 32768;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24).toString('hex');
  return `scrypt$${SCRYPT_N}$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  const parts = encoded?.split('$');
  const salt = parts?.[2] ?? 'unknown-account-timing-equalization';
  const actual = await derive(password, salt);
  if (!parts || parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== String(SCRYPT_N)) return false;
  const expected = Buffer.from(parts[3], 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function otpVerifier(id: string, phone: string, code: string): string {
  return createHmac('sha256', env.secret).update(`${id}|login|${phone}|${code}`).digest('hex');
}
export function constantEqual(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(env.encryptionKey, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64')).join('.');
}
export function decrypt<T>(value: string): T {
  const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env.encryptionKey, 'base64'), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as T;
}
export function readSession(req: Request): string | undefined {
  return req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('pricing_session='))?.slice('pricing_session='.length);
}
export function checkOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.headers.origin !== env.origin) throw new ForbiddenException('مبدأ درخواست معتبر نیست.');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException('درخواست بین‌سایتی مجاز نیست.');
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('؛ '));
  return result.data;
}
export const money = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,4})?$/, 'مبلغ معتبر با حداکثر چهار رقم اعشار وارد کنید.');
export const currency = z.enum(['IRR', 'IRT']);
export const password = z.string().min(PASSWORD_MIN_LENGTH).max(256);
export const email = z.string().email().max(254).transform(value => value.trim().toLowerCase());
