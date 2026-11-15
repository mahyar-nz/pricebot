import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { PlatformService } from './platform.js';
import { encrypt } from './security.js';
import { env } from './env.js';
import type { Db } from './db.js';
import type { AuthService } from './auth.js';
import type { SettingsService } from './settings.js';
import type { Store } from './generated/prisma/client.js';

describe('store read-only server boundary', () => {
  const service = () => new PlatformService({} as Db, { tenant: async () => ({ organizationId: 'org', user: { id: 'owner' } }) } as unknown as AuthService, {} as SettingsService);
  const store = (credential: object) => {
    env.encryptionKey = Buffer.alloc(32, 9).toString('base64');
    return { id: 'store', organizationId: 'org', url: 'https://fixture.invalid', currency: 'IRT', credentialCiphertext: encrypt(credential) } as Store;
  };
  it('treats legacy credentials as read-only until explicitly configured', () => {
    expect(service().isReadOnlyStore(store({ consumerKey: 'fixture', consumerSecret: 'fixture' }))).toBe(true);
  });
  it('does not leak bridge credentials in store responses', () => {
    const result = service().safeStore(store({ connectionKind: 'bridge', bridgeToken: 'fixture-secret', readOnly: false }));
    expect(result).toMatchObject({ connectionKind: 'bridge', readOnly: true });
    expect(JSON.stringify(result)).not.toMatch(/fixture-secret|credentialCiphertext|bridgeToken/);
  });
  it('blocks automatic mode before subscription or database writes', async () => {
    const platform = service();
    vi.spyOn(platform, 'getStore').mockResolvedValue(store({ connectionKind: 'bridge', bridgeToken: 'fixture', readOnly: true }));
    await expect(platform.configureStore({} as Request, 'store', { mode: 'AUTOMATIC', confirmAutomatic: true })).rejects.toThrow('فقط‌خواندنی');
  });
});
