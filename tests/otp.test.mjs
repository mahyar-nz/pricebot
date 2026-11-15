import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
// The test provider has no network operation and no HTTP outbox endpoint.
if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local development database required');
process.env.SMS_PROVIDER = 'test';
const { AuthService, testOtpOutbox } = await import('../apps/api/dist/auth.js');
const { Db } = await import('../apps/api/dist/db.js');
const { DEFAULT_SETTINGS } = await import('../apps/api/dist/settings.js');
const { digest } = await import('../apps/api/dist/security.js');
const db = new Db();
const settings = structuredClone(DEFAULT_SETTINGS);
settings.auth.otpEnabled = true;
const service = new AuthService(db, { get: async () => settings });
const ip = 'otp-fixture-' + randomUUID();
const request = { ip, headers: {} };
const response = { cookie() {} };
const phones = [];
async function challenge() {
  const phone = '+989' + randomInt(100000000,999999999);
  assert.equal(await db.user.count({where:{phone}}), 0);
  assert.equal(await db.otpChallenge.count({where:{phone}}), 0);
  phones.push(phone);
  const result = await service.requestOtp({phone}, request);
  const code = testOtpOutbox.get(result.challengeId)?.code;
  assert.match(code, /^\d{6}$/);
  assert.ok(!JSON.stringify(result).includes(code));
  return { phone, challengeId:result.challengeId, code };
}
test('OTP service with real PostgreSQL and network-free SMS provider', async t => {
  try {
    await t.test('stores a verifier and permits exactly one concurrent consumption', async()=>{
      const c=await challenge();
      const stored=await db.otpChallenge.findUniqueOrThrow({where:{id:c.challengeId}});
      assert.notEqual(stored.verifier,c.code);
      const attempts=await Promise.allSettled([service.verifyOtp(c,request,response),service.verifyOtp(c,request,response)]);
      assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
      const account=await db.user.findUniqueOrThrow({where:{phone:c.phone}});
      assert.ok(account.phoneVerifiedAt);
      await assert.rejects(service.verifyOtp(c,request,response));
    });
    await t.test('limits incorrect attempts and then rejects the correct code', async()=>{
      const c=await challenge();
      const wrong=c.code==='111111'?'222222':'111111';
      for(let i=0;i<settings.auth.otpMaxAttempts;i++) await assert.rejects(service.verifyOtp({...c,code:wrong},request,response));
      await assert.rejects(service.verifyOtp(c,request,response));
      assert.equal(await db.user.count({where:{phone:c.phone}}),0);
    });
    await t.test('rejects an expired challenge', async()=>{
      const c=await challenge();
      await db.otpChallenge.update({where:{id:c.challengeId},data:{expiresAt:new Date(Date.now()-1000)}});
      await assert.rejects(service.verifyOtp(c,request,response));
    });
    await t.test('enforces resend cooldown', async()=>{
      const c=await challenge();
      await assert.rejects(service.requestOtp({phone:c.phone},request),error=>error.getStatus()===429);
    });
    await t.test('blocks new signup when registration is disabled', async()=>{
      const c=await challenge(); settings.auth.registrationEnabled=false;
      await assert.rejects(service.verifyOtp(c,request,response),error=>error.getStatus()===403);
      assert.equal(await db.user.count({where:{phone:c.phone}}),0);
      settings.auth.registrationEnabled=true;
    });
    await t.test('disabling OTP blocks both request and verify', async()=>{
      settings.auth.otpEnabled=false;
      await assert.rejects(service.requestOtp({phone:phones[0]},request));
      await assert.rejects(service.verifyOtp({challengeId:randomUUID(),code:'123456'},request,response));
    });
  } finally {
    const users=await db.user.findMany({where:{phone:{in:phones}},include:{memberships:true}});
    const orgIds=users.flatMap(u=>u.memberships.map(m=>m.organizationId));
    await db.organization.deleteMany({where:{id:{in:orgIds}}});
    await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
    await db.otpChallenge.deleteMany({where:{phone:{in:phones}}});
    await db.rateLimit.deleteMany({where:{key:{in:[digest('otp-ip:'+ip),digest('otp-verify:'+ip),...phones.map(p=>digest('otp-phone:'+p))]}}});
    testOtpOutbox.clear(); await db.$disconnect();
  }
});
