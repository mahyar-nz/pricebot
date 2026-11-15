import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { calculatePrice, WooCommerceConnector, TorobShopConnector } from '@pricing/core';
import type { Currency, PricingStrategy, PricingStrategyType } from '@pricing/core';
import { AuthService, WRITE_ROLES } from './auth.js';
import { Db } from './db.js';
import { decrypt, encrypt, money, currency, parse, verifyPassword } from './security.js';
import { SettingsService, type Settings } from './settings.js';
import { tehranDayStart } from './time.js';
import type { Prisma, Product, PriceRule, Store } from './generated/prisma/client.js';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const productInput = z.object({ title: z.string().trim().min(2).max(300), sku: z.string().trim().min(1).max(120), currentPrice: money, costPrice: money, minPrice: money, maxPrice: money.nullable().optional(), currency, stock: z.number().int().min(0).max(10000000).default(0), brand: z.string().max(100).optional(), category: z.string().max(100).optional() });
const strategyTypes = ['MATCH_LOWEST', 'UNDERCUT_FIXED', 'UNDERCUT_PERCENT', 'AVERAGE', 'MEDIAN', 'TARGET_SELLER', 'TARGET_RANK', 'MARKUP', 'MARGIN', 'RAISE_TO_MARKET', 'FORMULA'] as const;
const percent = z.string().regex(/^(\d{1,2}(\.\d{1,4})?|100(\.0{1,4})?)$/);
const ruleConfig = z.object({ amount: money.optional(), percent: percent.optional(), targetSellerId: z.string().max(200).optional(), rank: z.number().int().min(1).max(100).optional(), formula: z.object({ base: z.enum(['cost', 'lowest', 'average', 'current']), multiplier: money, offset: z.string().regex(/^-?\d{1,16}(\.\d{1,4})?$/) }).optional(), maxChangePercent: percent.default('10'), maxDataAgeSeconds: z.number().int().min(60).max(604800).default(86400), minNetProfit: money.default('0'), minMarginPercent: percent.default('0'), commissionPercent: percent.default('0'), paymentPercent: percent.default('0'), taxPercent: percent.default('0'), shipping: money.default('0'), packaging: money.default('0'), fixed: money.default('0'), cooldownSeconds: z.number().int().min(60).max(604800).default(3600), maxDailyChangePercent: percent.default('20') });

@Injectable()
export class PlatformService {
  async torobState(req: Request) {
    const { organizationId } = await this.auth.tenant(req);
    const row = await this.db.torobConnection.findUnique({ where: { organizationId }, select: { domain: true, verifiedAt: true, updatedAt: true } });
    return { configured: !!row, ...row, scope: 'OWN_SHOP_ONLY', competitorMonitoring: false };
  }
  async torobConfigure(req: Request, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const input = parse(z.object({ token: z.string().trim().min(10).max(2048).refine(v => !/[\r\n]/.test(v)) }), body);
    await this.db.torobConnection.upsert({ where: { organizationId }, create: { organizationId, credentialCiphertext: encrypt(input) }, update: { credentialCiphertext: encrypt(input), domain: null, verifiedAt: null } });
    await this.audit(organizationId, user.id, 'torob.configure');
    return this.torobState(req);
  }
  async torobRead(req: Request, catalog = false) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    await this.subscription(organizationId);
    await this.auth.limit(`torob-read:${organizationId}`, 10, 3600);
    const row = await this.db.torobConnection.findUnique({ where: { organizationId } });
    if (!row) throw new BadRequestException('ابتدا توکن رسمی فروشگاه ترب را ثبت کنید.');
    const { token } = decrypt<{ token: string }>(row.credentialCiphertext);
    const connector = new TorobShopConnector(token);
    try {
      const shop = await connector.testConnection();
      const products = catalog ? await connector.readOwnedProducts() : undefined;
      const verified = await this.db.torobConnection.updateMany({ where: { organizationId, credentialCiphertext: row.credentialCiphertext }, data: { domain: shop.domain, verifiedAt: new Date() } });
      if (verified.count !== 1) throw new ConflictException('توکن هنگام دریافت تغییر کرده است؛ دوباره اتصال را آزمایش کنید.');
      await this.audit(organizationId, user.id, catalog ? 'torob.catalog.read' : 'torob.connection.test', undefined, { count: products?.length });
      return { shop, products, scope: 'OWN_SHOP_ONLY', competitorMonitoring: false };
    } catch (error) {
      await this.db.torobConnection.updateMany({ where: { organizationId, credentialCiphertext: row.credentialCiphertext }, data: { verifiedAt: null } });
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException('دریافت از API رسمی ترب تکمیل نشد. توکن، مجوز و محدودیت درخواست را بررسی کنید.');
    }
  }
  constructor(readonly db: Db, readonly auth: AuthService, readonly settings: SettingsService) {}
  async audit(organizationId: string | null, userId: string, action: string, entityId?: string, detail: unknown = {}) {
    return this.db.auditLog.create({ data: { organizationId, userId, action, entityId, detail: json(detail) } });
  }
  async subscription(organizationId: string) {
    const subscription = await this.db.subscription.findUnique({ where: { organizationId } });
    if (!subscription || !['TRIAL', 'ACTIVE'].includes(subscription.status) || subscription.endsAt <= new Date()) throw new ForbiddenException('اشتراک فعال لازم است.');
    return subscription;
  }
  async product(organizationId: string, id: string) {
    const product = await this.db.product.findFirst({ where: { id, organizationId } });
    if (!product) throw new NotFoundException('محصول یافت نشد.');
    return product;
  }
  async listProducts(req: Request) {
    const { organizationId } = await this.auth.tenant(req);
    const query = parse(z.object({ q: z.string().max(200).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), sort: z.enum(['title', 'updatedAt', 'currentPrice']).default('updatedAt'), direction: z.enum(['asc', 'desc']).default('desc') }), req.query);
    const where: Prisma.ProductWhereInput = { organizationId, ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { sku: { contains: query.q, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await Promise.all([this.db.product.findMany({ where, orderBy: { [query.sort]: query.direction }, skip: (query.page - 1) * query.limit, take: query.limit }), this.db.product.count({ where })]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async createProduct(req: Request, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, WRITE_ROLES);
    const input = parse(productInput, body);
    const subscription = await this.subscription(organizationId);
    const product = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      if (await tx.product.count({ where: { organizationId } }) >= subscription.productLimit) throw new ForbiddenException('سقف محصولات اشتراک تکمیل شده است.');
      return tx.product.create({ data: { ...input, organizationId } });
    });
    await this.audit(organizationId, user.id, 'product.create', product.id);
    return product;
  }
  async updateProduct(req: Request, id: string, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, WRITE_ROLES);
    await this.product(organizationId, id);
    const input = parse(productInput.partial(), body);
    const product = await this.db.product.update({ where: { id, organizationId }, data: { ...input, version: { increment: 1 }, ...(input.currentPrice ? { lastPriceChangeAt: new Date() } : {}) } });
    await this.audit(organizationId, user.id, 'product.update', id, { fields: Object.keys(input) });
    return product;
  }
  async productDetail(req: Request, id: string) {
    const { organizationId } = await this.auth.tenant(req);
    await this.product(organizationId, id);
    return this.db.product.findUnique({ where: { id, organizationId }, include: { observations: { where: { organizationId }, orderBy: { observedAt: 'desc' }, take: 100 }, recommendations: { where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 20 } } });
  }
  async addObservation(req: Request, productId: string, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, WRITE_ROLES);
    await this.subscription(organizationId);
    await this.product(organizationId, productId);
    const input = parse(z.object({ marketplace: z.enum(['torob', 'emalls', 'basalam', 'snappshop', 'tapsishop', 'digikala', 'manual']), sellerName: z.string().trim().min(1).max(200), price: money, currency, inStock: z.boolean().default(true), sourceUrl: z.string().url().max(2000).optional(), observedAt: z.string().datetime().optional(), matchVerified: z.boolean().default(false) }), body);
    const observedAt = input.observedAt ? new Date(input.observedAt) : new Date();
    if (observedAt.getTime() > Date.now() + 60000) throw new BadRequestException('زمان مشاهده نمی‌تواند در آینده باشد.');
    const observation = await this.db.observation.create({ data: { ...input, observedAt, organizationId, productId, source: 'manual_import', verifiedBy: input.matchVerified ? user.id : null, verifiedAt: input.matchVerified ? new Date() : null } });
    await this.audit(organizationId, user.id, 'observation.manual_import', observation.id, { productId, verified: input.matchVerified });
    return observation;
  }
  async rules(req: Request) { const { organizationId } = await this.auth.tenant(req); return this.db.priceRule.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }); }
  async createRule(req: Request, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, WRITE_ROLES);
    await this.subscription(organizationId);
    const input = parse(z.object({ name: z.string().trim().min(2).max(150), strategy: z.enum(strategyTypes), productId: z.string().uuid().optional(), config: ruleConfig.default({ maxChangePercent: '10', maxDataAgeSeconds: 86400, minNetProfit: '0', minMarginPercent: '0', commissionPercent: '0', paymentPercent: '0', taxPercent: '0', shipping: '0', packaging: '0', fixed: '0', cooldownSeconds: 3600, maxDailyChangePercent: '20' }), enabled: z.boolean().default(true) }), body);
    if (input.productId) await this.product(organizationId, input.productId);
    if (['UNDERCUT_FIXED'].includes(input.strategy) && !input.config.amount) throw new BadRequestException('مقدار کاهش قیمت لازم است.');
    if (['UNDERCUT_PERCENT', 'MARKUP', 'MARGIN'].includes(input.strategy) && !input.config.percent) throw new BadRequestException('درصد راهبرد لازم است.');
    if (input.strategy === 'TARGET_SELLER' && !input.config.targetSellerId) throw new BadRequestException('فروشنده هدف لازم است.');
    if (input.strategy === 'TARGET_RANK' && !input.config.rank) throw new BadRequestException('رتبه هدف لازم است.');
    if (input.strategy === 'FORMULA' && !input.config.formula) throw new BadRequestException('فرمول محدود لازم است.');
    const rule = await this.db.priceRule.create({ data: { ...input, config: json(input.config), organizationId } });
    await this.audit(organizationId, user.id, 'rule.create', rule.id);
    return rule;
  }
  async calculate(organizationId: string, product: Product, rule: PriceRule, execution = false) {
    const config = parse(ruleConfig, rule.config);
    const allOffers = await this.db.observation.findMany({ where: { organizationId, productId: product.id }, orderBy: { observedAt: 'desc' }, take: 500 });
    const offers = [...new Map(allOffers.map(item => [`${item.marketplace}:${item.sellerName}`, item] as const).reverse()).values()];
    const [organization, subscription, store] = await Promise.all([this.db.organization.findUniqueOrThrow({ where: { id: organizationId } }), this.db.subscription.findUnique({ where: { organizationId } }), product.storeId ? this.db.store.findFirst({ where: { id: product.storeId, organizationId } }) : null]);
    const today = tehranDayStart(new Date());
    const firstToday = await this.db.priceExecution.findFirst({ where: { organizationId, productId: product.id, status: 'SUCCEEDED', createdAt: { gte: today } }, orderBy: { createdAt: 'asc' } });
    return calculatePrice({ currency: product.currency as Currency, currentPrice: product.currentPrice.toString(), cost: product.costPrice.toString(), minPrice: product.minPrice.toString(), maxPrice: product.maxPrice?.toString(), strategy: { type: rule.strategy as PricingStrategyType, amount: config.amount, percent: config.percent, targetSellerId: config.targetSellerId, rank: config.rank, formula: config.formula } as PricingStrategy,
      offers: offers.map(item => ({ id: item.id, tenantId: item.organizationId, price: item.price.toString(), currency: item.currency as Currency, inStock: item.inStock, verified: item.matchVerified, observedAt: item.observedAt.toISOString(), sellerId: item.sellerName })),
      fees: { commissionPercent: config.commissionPercent, paymentPercent: config.paymentPercent, taxPercent: config.taxPercent, shipping: config.shipping, packaging: config.packaging, fixed: config.fixed, minNetProfit: config.minNetProfit, minMarginPercent: config.minMarginPercent },
      safety: { tenantId: organizationId, now: new Date().toISOString(), maxDataAgeSeconds: config.maxDataAgeSeconds, maxChangePercent: config.maxChangePercent, maxDailyChangePercent: config.maxDailyChangePercent, dailyOpeningPrice: firstToday?.oldPrice.toString() ?? product.currentPrice.toString(), subscriptionActive: !!subscription && ['TRIAL', 'ACTIVE'].includes(subscription.status) && subscription.endsAt > new Date(), automationEnabled: !execution || !!subscription?.automationEnabled && store?.mode === 'AUTOMATIC', connectionEnabled: !execution || !!store?.enabled && store.status === 'connected', hasPermission: true, emergencyStop: organization.emergencyStop, matchVerified: offers.some(item => item.matchVerified) || ['MARKUP', 'MARGIN'].includes(rule.strategy), cooldownSeconds: config.cooldownSeconds, lastChangedAt: product.lastPriceChangeAt?.toISOString(), currentVersion: product.version, expectedVersion: product.version } });
  }
  async recommend(req: Request, id: string, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, WRITE_ROLES);
    const input = parse(z.object({ ruleId: z.string().uuid() }), body);
    const product = await this.product(organizationId, id);
    const rule = await this.db.priceRule.findFirst({ where: { id: input.ruleId, organizationId, enabled: true } });
    if (!rule || rule.productId && rule.productId !== product.id) throw new NotFoundException('قانون مناسب یافت نشد.');
    const result = await this.calculate(organizationId, product, rule);
    const recommendation = await this.db.recommendation.create({ data: { organizationId, productId: id, ruleId: rule.id, currentPrice: product.currentPrice, candidatePrice: result.candidatePrice, productVersion: product.version, ruleVersion: rule.version, safetyPassed: result.safe, reasons: json(result.violations), explanation: json({ ...result.evidence, netProfit: result.netProfit }), status: result.safe ? 'DRY_RUN' : 'BLOCKED' } });
    await this.audit(organizationId, user.id, 'pricing.dry_run', recommendation.id, { safe: result.safe });
    return recommendation;
  }
  async recommendations(req: Request) { const { organizationId } = await this.auth.tenant(req); return this.db.recommendation.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 100, include: { product: { select: { title: true, sku: true, currency: true } } } }); }
  async approve(req: Request, id: string) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const recommendation = await this.db.recommendation.findFirst({ where: { id, organizationId } });
    if (!recommendation) throw new NotFoundException('پیشنهاد یافت نشد.');
    if (!recommendation.safetyPassed || recommendation.status !== 'DRY_RUN') throw new BadRequestException('این پیشنهاد قابل تأیید نیست.');
    const updated = await this.db.recommendation.update({ where: { id, organizationId }, data: { status: 'APPROVED', approvedBy: user.id, approvedAt: new Date() } });
    await this.audit(organizationId, user.id, 'pricing.approve', id);
    return updated;
  }
  connector(store: Store) {
    const credentials = this.storeCredentials(store);
    return new WooCommerceConnector({ storeUrl: store.url, ...credentials, readOnly: credentials.readOnly !== false || credentials.connectionKind === 'bridge', currency: store.currency as Currency });
  }
  storeCredentials(store: Store) { return decrypt<{ consumerKey?: string; consumerSecret?: string; bridgeToken?: string; connectionKind?: 'woocommerce' | 'bridge'; readOnly?: boolean }>(store.credentialCiphertext); }
  isReadOnlyStore(store: Store) { const credentials = this.storeCredentials(store); return credentials.connectionKind === 'bridge' || credentials.readOnly !== false; }
  safeStore(store: Store) { const { credentialCiphertext: _, ...safe } = store; const credentials = this.storeCredentials(store); return { ...safe, credentialsConfigured: true, readOnly: this.isReadOnlyStore(store), connectionKind: credentials.connectionKind ?? 'woocommerce' }; }
  async stores(req: Request) { const { organizationId } = await this.auth.tenant(req); return (await this.db.store.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })).map(item => this.safeStore(item)); }
  async createStore(req: Request, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const input = parse(z.object({ name: z.string().min(2).max(100), url: z.string().url().max(2000).refine(value => value.startsWith('https://'), 'HTTPS الزامی است.'), connectionKind: z.enum(['woocommerce', 'bridge']).default('woocommerce'), consumerKey: z.string().min(10).max(300).optional(), consumerSecret: z.string().min(10).max(300).optional(), bridgeToken: z.string().regex(/^pb_[a-f0-9]{64}$/).optional(), readOnly: z.boolean().default(true), currency }).superRefine((value, context) => {
      if (value.connectionKind === 'bridge' ? !value.bridgeToken || !value.readOnly : !value.consumerKey || !value.consumerSecret) context.addIssue({ code: 'custom', message: 'اطلاعات اتصال معتبر و دسترسی فقط‌خواندنی افزونه لازم است.' });
    }), body);
    const subscription = await this.subscription(organizationId);
    const store = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      if (await tx.store.count({ where: { organizationId } }) >= subscription.storeLimit) throw new ForbiddenException('سقف فروشگاه‌های اشتراک تکمیل شده است.');
      return tx.store.create({ data: { organizationId, name: input.name, url: input.url, currency: input.currency, credentialCiphertext: encrypt(input.connectionKind === 'bridge' ? { connectionKind: 'bridge', bridgeToken: input.bridgeToken, readOnly: true } : { connectionKind: 'woocommerce', consumerKey: input.consumerKey, consumerSecret: input.consumerSecret, readOnly: input.readOnly }) } });
    });
    await this.audit(organizationId, user.id, 'store.create', store.id);
    return this.safeStore(store);
  }
  async getStore(organizationId: string, id: string) {
    const store = await this.db.store.findFirst({ where: { organizationId, id } });
    if (!store) throw new NotFoundException('فروشگاه یافت نشد.');
    return store;
  }
  async testStore(req: Request, id: string) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const store = await this.getStore(organizationId, id);
    try {
      const result = await this.connector(store).testConnection();
      await this.db.store.update({ where: { id, organizationId }, data: { status: result.ok ? 'connected' : 'failed', lastError: result.ok ? null : result.message } });
      await this.audit(organizationId, user.id, 'store.test', id, { ok: result.ok });
      return result;
    } catch {
      await this.db.store.update({ where: { id, organizationId }, data: { status: 'failed', lastError: 'ارتباط برقرار نشد؛ آدرس و مجوزها را بررسی کنید.' } });
      throw new BadRequestException('ارتباط امن با فروشگاه برقرار نشد.');
    }
  }
  async configureStore(req: Request, id: string, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const store = await this.getStore(organizationId, id);
    const input = parse(z.object({ enabled: z.boolean().optional(), mode: z.enum(['MONITOR', 'DRY_RUN', 'AUTOMATIC']).optional(), confirmAutomatic: z.literal(true).optional() }), body);
    if (input.mode === 'AUTOMATIC') {
      if (this.isReadOnlyStore(store)) throw new ForbiddenException('این اتصال فقط‌خواندنی است و تغییر قیمت مجاز نیست.');
      const subscription = await this.subscription(organizationId);
      if (!input.confirmAutomatic || !subscription.automationEnabled || store.status !== 'connected') throw new ForbiddenException('فعال‌سازی خودکار به تأیید صریح، اتصال معتبر و اشتراک مجاز نیاز دارد.');
    }
    const updated = await this.db.store.update({ where: { id, organizationId }, data: { enabled: input.enabled, mode: input.mode } });
    await this.audit(organizationId, user.id, 'store.configure', id, { enabled: input.enabled, mode: input.mode });
    return this.safeStore(updated);
  }
  async syncStore(req: Request, id: string) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const store = await this.getStore(organizationId, id);
    if (!store.enabled || store.status !== 'connected') throw new ForbiddenException('ابتدا اتصال فروشگاه را آزمایش کنید.');
    const subscription = await this.subscription(organizationId);
    const syncStartedAt = new Date();
    try {
      const remote = await this.connector(store).syncProducts({ modifiedAfter: store.lastSyncedAt?.toISOString() });
      let imported = 0;
      await this.db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
        let count = await tx.product.count({ where: { organizationId } });
        for (const item of remote) {
          if (item.type === 'variable') continue;
          const existing = await tx.product.findFirst({ where: { organizationId, storeId: id, externalId: item.id } });
          if (!existing && count >= subscription.productLimit) throw new ForbiddenException('همگام‌سازی از سقف محصولات اشتراک عبور می‌کند.');
          const fields = { title: item.name, currentPrice: item.price, currency: item.currency, stock: item.stockQuantity ?? (item.inStock ? 1 : 0), attributes: json(item.attributes), parentExternalId: item.parentId ?? null };
          if (existing) await tx.product.update({ where: { id: existing.id, organizationId }, data: { ...fields, version: { increment: 1 } } });
          else { await tx.product.create({ data: { ...fields, organizationId, storeId: id, externalId: item.id, sku: item.sku || `${id}:${item.id}`, costPrice: '0', minPrice: '0' } }); count++; }
          imported++;
        }
        await tx.store.update({ where: { id, organizationId }, data: { lastSyncedAt: syncStartedAt, lastError: null } });
      }, { timeout: 60000 });
      await this.audit(organizationId, user.id, 'store.sync', id, { imported });
      return { imported };
    } catch (error) {
      await this.db.store.update({ where: { id, organizationId }, data: { lastError: 'همگام‌سازی تکمیل نشد. ظرفیت اشتراک، مجوزها و پاسخ فروشگاه را بررسی کنید.' } });
      if (error instanceof ForbiddenException) throw error;
      throw new BadRequestException('همگام‌سازی تکمیل نشد. هیچ موفقیت تأییدنشده‌ای ثبت نشده است.');
    }
  }
  async execute(req: Request, id: string, body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const input = parse(z.object({ idempotencyKey: z.string().uuid() }), body);
    const existing = await this.db.priceExecution.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) { if (existing.organizationId !== organizationId || existing.recommendationId !== id) throw new ConflictException('کلید عملیات قابل استفاده نیست.'); return existing; }
    const recommendation = await this.db.recommendation.findFirst({ where: { id, organizationId }, include: { rule: true } });
    if (!recommendation || recommendation.status !== 'APPROVED' || !recommendation.candidatePrice) throw new BadRequestException('پیشنهاد تأییدشده لازم است.');
    const product = await this.product(organizationId, recommendation.productId);
    if (product.version !== recommendation.productVersion || recommendation.rule.version !== recommendation.ruleVersion) throw new ConflictException('محصول یا قانون تغییر کرده است. دوباره پیش‌نمایش بگیرید.');
    if (!product.storeId || !product.externalId) throw new BadRequestException('محصول به فروشگاه متصل نیست.');
    if (product.costPrice.lte(0) || product.minPrice.lte(0)) throw new BadRequestException('پیش از اجرا، هزینه خرید و کف قیمت مثبت و معتبر ثبت کنید.');
    if (product.stock <= 0) throw new BadRequestException('اجرای قیمت برای محصول ناموجود مجاز نیست.');
    const store = await this.getStore(organizationId, product.storeId);
    if (this.isReadOnlyStore(store)) throw new ForbiddenException('این اتصال فقط‌خواندنی است و تغییر قیمت مجاز نیست.');
    if (!recommendation.rule.enabled) throw new ForbiddenException('قانون غیرفعال است.');
    const current = await this.calculate(organizationId, product, recommendation.rule, true);
    if (!current.safe || current.candidatePrice !== recommendation.candidatePrice.toString()) throw new ConflictException('شرایط ایمنی یا داده بازار تغییر کرده است. دوباره پیش‌نمایش بگیرید.');
    const execution = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const nowProduct = await tx.product.findUniqueOrThrow({ where: { id: product.id, organizationId } });
      if (nowProduct.version !== product.version) throw new ConflictException('قیمت محصول تغییر کرده است.');
      const active = await tx.priceExecution.count({ where: { productId: product.id, organizationId, status: { in: ['PENDING', 'RECONCILIATION_REQUIRED'] } } });
      if (active > 0) throw new ConflictException('این محصول عملیات باز یا نیازمند بررسی دارد.');
      const claimed = await tx.recommendation.updateMany({ where: { id, organizationId, status: 'APPROVED' }, data: { status: 'EXECUTING' } });
      if (claimed.count !== 1) throw new ConflictException('عملیات دیگری این پیشنهاد را دریافت کرده است.');
      return tx.priceExecution.create({ data: { organizationId, productId: product.id, recommendationId: id, idempotencyKey: input.idempotencyKey, oldPrice: product.currentPrice, newPrice: recommendation.candidatePrice! } });
    });
    try {
      // Re-read permission and stop switches immediately before the external side effect.
      await this.auth.tenant(req, ['OWNER', 'ADMIN']);
      const rechecked = await this.calculate(organizationId, await this.product(organizationId, product.id), recommendation.rule, true);
      if (!rechecked.safe || rechecked.candidatePrice !== current.candidatePrice) throw new Error('Safety conditions changed');
      const result = await this.connector(store).updatePrice({ productId: product.externalId, parentId: product.parentExternalId ?? undefined, expectedPrice: product.currentPrice.toString(), price: recommendation.candidatePrice.toString(), currency: product.currency as Currency });
      if (!result.verified) throw new Error('Remote result was not verified');
      await this.db.$transaction(async tx => {
        const update = await tx.product.updateMany({ where: { id: product.id, organizationId, version: product.version }, data: { currentPrice: result.price, version: { increment: 1 }, lastPriceChangeAt: new Date() } });
        if (update.count !== 1) throw new Error('Local version changed; remote reconciliation required');
        await tx.priceExecution.update({ where: { id: execution.id }, data: { status: 'SUCCEEDED', completedAt: new Date(), evidence: json({ verified: true, previousPrice: result.previousPrice, price: result.price }) } });
        await tx.recommendation.update({ where: { id }, data: { status: 'EXECUTED' } });
      });
      await this.audit(organizationId, user.id, 'pricing.executed', execution.id, { oldPrice: product.currentPrice.toString(), newPrice: result.price });
    } catch {
      await this.db.priceExecution.update({ where: { id: execution.id }, data: { status: 'RECONCILIATION_REQUIRED', error: 'نتیجه عملیات قطعی نیست؛ پیش از تلاش مجدد وضعیت فروشگاه بررسی شود.', completedAt: new Date() } });
      await this.db.recommendation.update({ where: { id }, data: { status: 'RECONCILIATION_REQUIRED' } });
      await this.audit(organizationId, user.id, 'pricing.reconciliation_required', execution.id);
    }
    return this.db.priceExecution.findUnique({ where: { id: execution.id } });
  }
  async dashboard(req: Request) {
    const { organizationId } = await this.auth.tenant(req);
    const [products, stores, observations, recommendations, executions, subscription, recentActivity, staleProducts] = await Promise.all([
      this.db.product.count({ where: { organizationId } }), this.db.store.count({ where: { organizationId, status: 'connected', enabled: true } }), this.db.observation.count({ where: { organizationId } }), this.db.recommendation.count({ where: { organizationId, status: { in: ['DRY_RUN', 'APPROVED'] } } }), this.db.priceExecution.count({ where: { organizationId, status: 'SUCCEEDED' } }), this.db.subscription.findUnique({ where: { organizationId } }), this.db.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 10 }), this.db.product.count({ where: { organizationId, observations: { none: { observedAt: { gte: new Date(Date.now() - 86400000) } } } } }),
    ]);
    return { products, stores, observations, recommendations, executions, subscription, recentActivity, staleProducts };
  }
  async billing(req: Request) {
    const { organizationId } = await this.auth.tenant(req);
    const [subscription, products, stores, members, invoices] = await Promise.all([this.db.subscription.findUnique({ where: { organizationId } }), this.db.product.count({ where: { organizationId } }), this.db.store.count({ where: { organizationId } }), this.db.membership.count({ where: { organizationId } }), this.db.invoice.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 100 })]);
    return { subscription, usage: { products, stores, members }, invoices, paymentStatus: 'awaiting_configuration' };
  }
  async quote(body: unknown) {
    const input = parse(z.object({ products: z.number().int().min(1).max(100000), checksPerDay: z.number().int().min(1).max(100), marketplaces: z.union([z.number().int().min(1).max(6), z.array(z.string()).min(1).max(6)]), months: z.number().int().min(1).max(24) }), body);
    const { billing } = await this.settings.get();
    if (!billing.checksPerDayOptions.includes(input.checksPerDay) || !(String(input.months) in billing.durationDiscounts)) throw new BadRequestException('دوره یا تناوب انتخاب‌شده موجود نیست.');
    const marketplaces = Array.isArray(input.marketplaces) ? new Set(input.marketplaces).size : input.marketplaces;
    const monthly = BigInt(billing.baseMonthly) + BigInt(billing.perProductMonthly) * BigInt(input.products) * BigInt(input.checksPerDay) * BigInt(marketplaces);
    const discountPercent = billing.durationDiscounts[String(input.months)];
    const subtotal = monthly * BigInt(input.months); const total = subtotal * BigInt(100 - discountPercent) / 100n;
    return { ...input, marketplaces, currency: 'IRR', monthly: monthly.toString(), subtotal: subtotal.toString(), discountPercent, discount: (subtotal - total).toString(), total: total.toString(), theoreticalChecks: input.products * input.checksPerDay * marketplaces * 30 * input.months, paymentStatus: 'awaiting_configuration' };
  }
  async updateSettings(req: Request, body: unknown) {
    const { user, sessionId } = await this.auth.admin(req);
    const input = parse(z.object({ password: z.string().max(256), branding: z.object({ name: z.string().min(2).max(100).optional(), title: z.string().max(200).optional(), subtitle: z.string().max(500).optional(), primaryColor: z.string().regex(/^#[\da-fA-F]{6}$/).optional(), secondaryColor: z.string().regex(/^#[\da-fA-F]{6}$/).optional(), supportEmail: z.union([z.literal(''), z.string().email()]).optional(), description: z.string().max(1000).optional(), supportPhone: z.string().max(30).optional(), logoUrl: z.string().max(2000).optional(), faviconUrl: z.string().max(2000).optional() }).optional(), auth: z.object({ emailEnabled: z.boolean().optional(), otpEnabled: z.boolean().optional(), registrationEnabled: z.boolean().optional(), requireEmailVerification: z.boolean().optional(), otpExpirySeconds: z.number().int().min(60).max(300).optional(), otpCooldownSeconds: z.number().int().min(30).max(300).optional(), otpMaxAttempts: z.number().int().min(1).max(5).optional(), sessionHours: z.number().int().min(1).max(168).optional() }).optional(), billing: z.object({ baseMonthly: z.string().regex(/^\d{1,15}$/).optional(), perProductMonthly: z.string().regex(/^\d{1,12}$/).optional(), checksPerDayOptions: z.array(z.number().int().min(1).max(24)).min(1).max(24).optional(), durationDiscounts: z.record(z.string().regex(/^([1-9]|1[0-9]|2[0-4])$/), z.number().int().min(0).max(90)).optional(), trialDays: z.number().int().min(1).max(60).optional(), trialProductLimit: z.number().int().min(1).max(10000).optional(), trialStoreLimit: z.number().int().min(1).max(20).optional(), trialMemberLimit: z.number().int().min(1).max(100).optional() }).optional() }), body);
    await this.auth.limit(`admin-reauth:${user.id}`, 10, 900);
    const account = await this.db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(input.password, account.passwordHash))) throw new ForbiddenException('تأیید مجدد رمز عبور ناموفق بود.');
    const settings = await this.settings.get();
    const next: Settings = { branding: { ...settings.branding, ...input.branding }, auth: { ...settings.auth, ...input.auth }, billing: { ...settings.billing, ...input.billing } };
    if (!next.auth.emailEnabled && !next.auth.otpEnabled) throw new BadRequestException('حداقل یک روش ورود باید فعال بماند.');
    if (next.auth.otpEnabled && !this.auth.smsReady()) throw new BadRequestException('پیکربندی و تأیید سرویس پیامک لازم است.');
    if (!next.auth.emailEnabled && (!user.phone || !account.phoneVerifiedAt)) throw new BadRequestException('برای جلوگیری از قفل شدن مدیر، ابتدا شماره تأییدشده لازم است.');
    if (next.auth.requireEmailVerification) throw new BadRequestException('فعال‌سازی تأیید ایمیل تا راه‌اندازی سرویس ایمیل در دسترس نیست.');
    await this.settings.save(next);
    if (input.auth) await this.db.session.deleteMany({ where: { id: { not: sessionId } } });
    await this.audit(null, user.id, 'admin.settings.update', undefined, { sections: Object.keys(input).filter(key => key !== 'password') });
    return next;
  }
}

