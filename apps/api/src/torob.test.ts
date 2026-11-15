import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { TorobShopConnector } from '@pricing/core';
import { PlatformService } from './platform.js';
import { encrypt } from './security.js';
import { env } from './env.js';
import type { Db } from './db.js';
import type { AuthService } from './auth.js';
import type { SettingsService } from './settings.js';

describe('Torob credential rotation during an in-flight read', () => {
  it('does not verify or clear the replacement credential', async () => {
    env.encryptionKey = Buffer.alloc(32, 7).toString('base64');
    const originalCiphertext = encrypt({token:'test-original-token'});
    const updateMany = vi.fn().mockResolvedValue({count:0});
    const db = { torobConnection: { findUnique: async()=>({credentialCiphertext:originalCiphertext}), updateMany }, subscription: { findUnique:async()=>({status:'ACTIVE', endsAt:new Date(Date.now()+60000)}) } } as unknown as Db;
    const auth = { tenant:async()=>({organizationId:'org', user:{id:'user'}}), limit:async()=>{} } as unknown as AuthService;
    const spy = vi.spyOn(TorobShopConnector.prototype,'testConnection').mockResolvedValue({domain:'fixture.invalid',status:'active'});
    try {
      await expect(new PlatformService(db,auth,{} as SettingsService).torobRead({} as Request)).rejects.toThrow('توکن هنگام دریافت تغییر کرده');
      expect(updateMany).toHaveBeenCalledTimes(2);
      for(const [input] of updateMany.mock.calls) expect(input.where).toEqual({organizationId:'org',credentialCiphertext:originalCiphertext});
    } finally { spy.mockRestore(); }
  });
  it('never marks an incomplete catalog fetch as verified', async()=>{
    env.encryptionKey = Buffer.alloc(32, 7).toString('base64');
    const updateMany=vi.fn().mockResolvedValue({count:1});
    const db={torobConnection:{findUnique:async()=>({credentialCiphertext:encrypt({token:'fixture'})}),updateMany},subscription:{findUnique:async()=>({status:'ACTIVE',endsAt:new Date(Date.now()+60000)})}} as unknown as Db;
    const auth={tenant:async()=>({organizationId:'org',user:{id:'user'}}),limit:async()=>{}} as unknown as AuthService;
    const connection=vi.spyOn(TorobShopConnector.prototype,'testConnection').mockResolvedValue({domain:'fixture.invalid',status:'active'});
    const catalog=vi.spyOn(TorobShopConnector.prototype,'readOwnedProducts').mockRejectedValue(new Error('TOROB_HTTP_429'));
    try{
      await expect(new PlatformService(db,auth,{} as SettingsService).torobRead({} as Request,true)).rejects.toThrow('دریافت از API رسمی ترب تکمیل نشد');
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany.mock.calls[0]![0].data).toEqual({verifiedAt:null});
    }finally{connection.mockRestore();catalog.mockRestore();}
  });
});
