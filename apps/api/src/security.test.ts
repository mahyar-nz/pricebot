import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { checkOrigin, constantEqual, decrypt, digest, encrypt, hashPassword, money, otpVerifier, readSession, verifyPassword } from './security.js';
import { env } from './env.js';

describe('security primitives', () => {
  it('uses independently salted password hashes and verifies credentials', async () => {
    const first = await hashPassword('Test password with enough entropy!');
    const second = await hashPassword('Test password with enough entropy!');
    expect(first).not.toEqual(second);
    expect(first).not.toContain('Test password');
    expect(await verifyPassword('Test password with enough entropy!', first)).toBe(true);
    expect(await verifyPassword('incorrect password', first)).toBe(false);
    expect(await verifyPassword('incorrect password', undefined)).toBe(false);
  });
  it('authenticates encrypted credentials and rejects tampering', () => {
    env.encryptionKey = randomBytes(32).toString('base64');
    const value = { consumerKey: 'ck_secret', consumerSecret: 'cs_secret' };
    const encrypted = encrypt(value);
    expect(encrypted).not.toContain('ck_secret');
    expect(decrypt(encrypted)).toEqual(value);
    const segments = encrypted.split('.');
    segments[2] = Buffer.from('malicious replacement').toString('base64');
    expect(() => decrypt(segments.join('.'))).toThrow();
  });
  it('binds OTP verifiers to challenge and destination', () => {
    env.secret = 'test-secret-used-only-within-this-test-suite';
    expect(otpVerifier('challenge-a', '+989123456789', '123456')).not.toBe(otpVerifier('challenge-b', '+989123456789', '123456'));
    expect(otpVerifier('challenge-a', '+989123456789', '123456')).not.toBe(otpVerifier('challenge-a', '+989123456788', '123456'));
    expect(constantEqual('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(constantEqual('a', 'aa')).toBe(false);
    expect(constantEqual('a'.repeat(64), 'b'.repeat(64))).toBe(false);
  });
  it('rejects missing and cross-site origin on mutations', () => {
    env.origin = 'https://pricing.example';
    expect(() => checkOrigin({ method: 'POST', headers: {} } as Request)).toThrow();
    expect(() => checkOrigin({ method: 'POST', headers: { origin: 'https://evil.example' } } as Request)).toThrow();
    expect(() => checkOrigin({ method: 'POST', headers: { origin: env.origin, 'sec-fetch-site': 'cross-site' } } as Request)).toThrow();
    expect(() => checkOrigin({ method: 'POST', headers: { origin: env.origin } } as Request)).not.toThrow();
    expect(() => checkOrigin({ method: 'GET', headers: {} } as Request)).not.toThrow();
  });
  it('parses only the session cookie and stores random-token digests', () => {
    expect(readSession({ headers: { cookie: 'other=x; pricing_session=abc123; next=y' } } as Request)).toBe('abc123');
    expect(readSession({ headers: { cookie: 'fake_pricing_session=abc123' } } as Request)).toBeUndefined();
    expect(digest(randomBytes(32).toString('hex'))).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects ambiguous, nonfinite and negative monetary API inputs', () => {
    for (const value of ['-1', 'NaN', 'Infinity', '1e10', '1,000', '01', '100.12345']) expect(money.safeParse(value).success).toBe(false);
    for (const value of ['0', '1000', '1000.1234']) expect(money.safeParse(value).success).toBe(true);
  });
});
