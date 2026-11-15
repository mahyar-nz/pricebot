import { BadRequestException, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { MelliPayamakProvider, normalizePhone } from '@pricing/core';
import { Db } from './db.js';
import { env } from './env.js';
import { SettingsService } from './settings.js';
import { constantEqual, digest, email, hashPassword, otpVerifier, parse, password, readSession, verifyPassword } from './security.js';

export const testOtpOutbox = new Map<string, { phone: string; code: string }>();
export const READ_ROLES = ['OWNER', 'ADMIN', 'PRICING_MANAGER', 'ANALYST', 'VIEWER'];
export const WRITE_ROLES = ['OWNER', 'ADMIN', 'PRICING_MANAGER'];
class TooManyRequestsException extends HttpException { constructor(message: string) { super(message, 429); } }

@Injectable()
export class AuthService {
  constructor(readonly db: Db, readonly settings: SettingsService) {}
  async limit(key: string, max: number, seconds: number) {
    const hashedKey = digest(key);
    const windowStart = new Date(Date.now() - seconds * 1000);
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${hashedKey}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" < ${windowStart} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${windowStart} THEN NOW() ELSE "RateLimit"."windowStart" END
      RETURNING "count"`;
    if (rows[0].count > max) throw new TooManyRequestsException('تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد تلاش کنید.');
  }
  async me(req: Request) {
    const token = readSession(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('ابتدا وارد حساب خود شوید.');
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: { include: { memberships: { include: { organization: true } } } } } });
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException('نشست منقضی شده است.');
    const { passwordHash: _, ...user } = session.user;
    const { memberships, ...safeUser } = user;
    return { user: safeUser, memberships, sessionId: session.id };
  }
  async tenant(req: Request, allowed = READ_ROLES) {
    const context = await this.me(req);
    const organizationId = req.headers['x-organization-id'];
    if (typeof organizationId !== 'string') throw new BadRequestException('سازمان را انتخاب کنید.');
    const membership = context.memberships.find(item => item.organizationId === organizationId);
    if (!membership || !allowed.includes(membership.role)) throw new ForbiddenException('دسترسی مجاز نیست.');
    return { ...context, organizationId, membership, organization: membership.organization };
  }
  async admin(req: Request) {
    const context = await this.me(req);
    if (context.user.platformRole !== 'SUPER_ADMIN') throw new ForbiddenException('دسترسی مدیر سامانه لازم است.');
    return context;
  }
  async session(userId: string, res: Response) {
    const settings = await this.settings.get();
    const token = randomBytes(32).toString('hex');
    const maxAge = settings.auth.sessionHours * 60 * 60 * 1000;
    await this.db.session.create({ data: { userId, tokenHash: digest(token), expiresAt: new Date(Date.now() + maxAge) } });
    res.cookie('pricing_session', token, { httpOnly: true, secure: env.production, sameSite: 'lax', path: '/', maxAge });
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, platformRole: true } });
    const memberships = await this.db.membership.findMany({ where: { userId }, include: { organization: true } });
    return { user, memberships };
  }
  async register(body: unknown, req: Request, res: Response) {
    const input = parse(z.object({ name: z.string().trim().min(2).max(100), email, password, organizationName: z.string().trim().min(2).max(100) }), body);
    const settings = await this.settings.get();
    if (!settings.auth.emailEnabled || !settings.auth.registrationEnabled) throw new ForbiddenException('ثبت‌نام با ایمیل غیرفعال است.');
    if (settings.auth.requireEmailVerification) throw new ForbiddenException('ارسال تأیید ایمیل هنوز پیکربندی نشده است.');
    await this.limit(`register:${req.ip}`, 10, 3600);
    if (await this.db.user.findUnique({ where: { email: input.email } })) throw new BadRequestException('امکان ایجاد حساب با این اطلاعات وجود ندارد.');
    const encoded = await hashPassword(input.password);
    const user = await this.db.user.create({ data: { name: input.name, email: input.email, passwordHash: encoded, memberships: { create: { role: 'OWNER', organization: { create: { name: input.organizationName, subscription: { create: { endsAt: new Date(Date.now() + settings.billing.trialDays * 86400000), productLimit: settings.billing.trialProductLimit, storeLimit: settings.billing.trialStoreLimit, memberLimit: settings.billing.trialMemberLimit, pricingSnapshot: settings.billing } } } } } } } });
    const result = await this.session(user.id, res);
    await this.db.auditLog.create({ data: { organizationId: result.memberships[0].organizationId, userId: user.id, action: 'auth.register' } });
    return result;
  }
  async login(body: unknown, req: Request, res: Response) {
    const input = parse(z.object({ email, password: z.string().max(256) }), body);
    const settings = await this.settings.get();
    if (!settings.auth.emailEnabled) throw new ForbiddenException('ورود با ایمیل غیرفعال است.');
    await this.limit(`login-ip:${req.ip}`, 40, 900);
    await this.limit(`login:${input.email}`, 10, 900);
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    if (!(await verifyPassword(input.password, user?.passwordHash)) || !user) throw new UnauthorizedException('اطلاعات ورود صحیح نیست.');
    if (settings.auth.requireEmailVerification && !user.emailVerifiedAt) throw new ForbiddenException('تأیید ایمیل لازم است.');
    const old = readSession(req);
    if (old) await this.db.session.deleteMany({ where: { tokenHash: digest(old) } });
    await this.db.auditLog.create({ data: { userId: user.id, action: 'auth.login' } });
    return this.session(user.id, res);
  }
  async logout(req: Request, res: Response, all = false) {
    const current = await this.me(req);
    await this.db.session.deleteMany({ where: all ? { userId: current.user.id } : { id: current.sessionId } });
    res.clearCookie('pricing_session', { httpOnly: true, secure: env.production, sameSite: 'lax', path: '/' });
    return { loggedOut: true };
  }
  smsProvider() {
    return new MelliPayamakProvider({ username: process.env.MELIPAYAMAK_USERNAME ?? '', password: process.env.MELIPAYAMAK_PASSWORD ?? '', bodyId: Number(process.env.MELIPAYAMAK_BODY_ID ?? 0) });
  }
  smsReady() {
    return process.env.SMS_PROVIDER === 'test' && !env.production || process.env.SMS_PROVIDER === 'melipayamak' && !!process.env.MELIPAYAMAK_USERNAME && !!process.env.MELIPAYAMAK_PASSWORD && Number(process.env.MELIPAYAMAK_BODY_ID) > 0 && process.env.MELIPAYAMAK_VALIDATED === 'true';
  }
  async requestOtp(body: unknown, req: Request) {
    const input = parse(z.object({ phone: z.string().max(24) }), body);
    let phone: string;
    try { phone = normalizePhone(input.phone); } catch { throw new BadRequestException('شماره همراه معتبر نیست.'); }
    const { auth } = await this.settings.get();
    if (!auth.otpEnabled || !this.smsReady()) throw new ForbiddenException('ورود پیامکی هنوز فعال نیست.');
    await this.limit(`otp-ip:${req.ip}`, 15, 3600);
    await this.limit(`otp-phone:${phone}`, 5, 3600);
    const id = randomUUID(); const code = String(randomInt(100000, 1000000));
    await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
      const latest = await tx.otpChallenge.findFirst({ where: { phone, purpose: 'login' }, orderBy: { createdAt: 'desc' } });
      if (latest && Date.now() - latest.createdAt.getTime() < auth.otpCooldownSeconds * 1000) throw new TooManyRequestsException('برای درخواست مجدد کمی صبر کنید.');
      await tx.otpChallenge.updateMany({ where: { phone, purpose: 'login', consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.otpChallenge.create({ data: { id, phone, purpose: 'login', verifier: otpVerifier(id, phone, code), expiresAt: new Date(Date.now() + auth.otpExpirySeconds * 1000) } });
    });
    try {
      if (process.env.SMS_PROVIDER === 'test' && !env.production) testOtpOutbox.set(id, { phone, code });
      else {
        const result = await this.smsProvider().sendOtp(phone, code);
        if (result.status !== 'accepted') throw new Error('SMS delivery rejected');
      }
      await this.db.otpChallenge.update({ where: { id }, data: { deliveryStatus: 'accepted' } });
    } catch {
      await this.db.otpChallenge.update({ where: { id }, data: { deliveryStatus: 'failed', consumedAt: new Date() } });
      throw new BadRequestException('ارسال پیامک انجام نشد. لطفاً دوباره تلاش کنید.');
    }
    return { challengeId: id, expiresIn: auth.otpExpirySeconds, resendAfter: auth.otpCooldownSeconds };
  }
  async verifyOtp(body: unknown, req: Request, res: Response) {
    const input = parse(z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/), name: z.string().trim().min(2).max(100).optional(), organizationName: z.string().trim().min(2).max(100).optional() }), body);
    const settings = await this.settings.get();
    if (!settings.auth.otpEnabled || !this.smsReady()) throw new ForbiddenException('ورود پیامکی غیرفعال است.');
    await this.limit(`otp-verify:${req.ip}`, 40, 900);
    const verified = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "OtpChallenge" WHERE "id" = ${input.challengeId} FOR UPDATE`;
      const challenge = await tx.otpChallenge.findUnique({ where: { id: input.challengeId } });
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= settings.auth.otpMaxAttempts || challenge.deliveryStatus !== 'accepted') return null;
      await tx.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      if (!constantEqual(challenge.verifier, otpVerifier(challenge.id, challenge.phone, input.code))) return null;
      await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      return challenge.phone;
    });
    if (!verified) throw new UnauthorizedException('کد تأیید نامعتبر یا منقضی است.');
    testOtpOutbox.delete(input.challengeId);
    let user = await this.db.user.findUnique({ where: { phone: verified } });
    if (!user) {
      if (!settings.auth.registrationEnabled) throw new ForbiddenException('ثبت‌نام غیرفعال است.');
      user = await this.db.user.create({ data: { phone: verified, phoneVerifiedAt: new Date(), name: input.name ?? 'کاربر', memberships: { create: { role: 'OWNER', organization: { create: { name: input.organizationName ?? 'فروشگاه من', subscription: { create: { endsAt: new Date(Date.now() + settings.billing.trialDays * 86400000), productLimit: settings.billing.trialProductLimit, storeLimit: settings.billing.trialStoreLimit, memberLimit: settings.billing.trialMemberLimit, pricingSnapshot: settings.billing } } } } } } } });
    }
    return this.session(user.id, res);
  }
}
