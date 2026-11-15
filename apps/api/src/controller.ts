import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CONNECTOR_REGISTRY } from '@pricing/core';
import { AuthService } from './auth.js';
import { Db } from './db.js';
import { PlatformService } from './platform.js';
import { parse } from './security.js';
import { SettingsService } from './settings.js';
import { openApi } from './openapi.js';

const data = async <T>(value: T | Promise<T>) => ({ data: await value });
@Controller()
export class ApiController {
  constructor(private readonly auth: AuthService, private readonly platform: PlatformService, private readonly db: Db, private readonly settings: SettingsService) {}
  @Get('health') async health() { await this.db.$queryRaw`SELECT 1`; return data({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() }); }
  @Get('openapi.json') openapi() { return openApi; }
  @Get('public/config') async config() { const settings = await this.settings.get(); return data({ ...settings, connectors: CONNECTOR_REGISTRY }); }
  @Get('connectors') connectors() { return data(CONNECTOR_REGISTRY); }
  @Post('auth/register') register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return data(this.auth.register(body, req, res)); }
  @Post('auth/login') login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return data(this.auth.login(body, req, res)); }
  @Get('auth/me') async me(@Req() req: Request) { const { sessionId: _, ...me } = await this.auth.me(req); return data(me); }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return data(this.auth.logout(req, res)); }
  @Post('auth/logout-all') logoutAll(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return data(this.auth.logout(req, res, true)); }
  @Post('auth/otp/request') requestOtp(@Body() body: unknown, @Req() req: Request) { return data(this.auth.requestOtp(body, req)); }
  @Post('auth/otp/verify') verifyOtp(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return data(this.auth.verifyOtp(body, req, res)); }
  @Get('auth/sessions') async sessions(@Req() req: Request) { const { user, sessionId } = await this.auth.me(req); const sessions = await this.db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }); return data(sessions.map(item => ({ ...item, current: item.id === sessionId }))); }
  @Get('dashboard') dashboard(@Req() req: Request) { return data(this.platform.dashboard(req)); }
  @Get('products') products(@Req() req: Request) { return data(this.platform.listProducts(req)); }
  @Post('products') createProduct(@Req() req: Request, @Body() body: unknown) { return data(this.platform.createProduct(req, body)); }
  @Get('products/:id') product(@Req() req: Request, @Param('id') id: string) { return data(this.platform.productDetail(req, id)); }
  @Patch('products/:id') updateProduct(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { return data(this.platform.updateProduct(req, id, body)); }
  @Post('products/:id/observations') observation(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { return data(this.platform.addObservation(req, id, body)); }
  @Post('products/:id/recommend') recommend(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { return data(this.platform.recommend(req, id, body)); }
  @Get('rules') rules(@Req() req: Request) { return data(this.platform.rules(req)); }
  @Post('rules') createRule(@Req() req: Request, @Body() body: unknown) { return data(this.platform.createRule(req, body)); }
  @Get('recommendations') recommendations(@Req() req: Request) { return data(this.platform.recommendations(req)); }
  @Post('recommendations/:id/approve') approve(@Req() req: Request, @Param('id') id: string) { return data(this.platform.approve(req, id)); }
  @Post('recommendations/:id/execute') execute(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { return data(this.platform.execute(req, id, body)); }
  @Get('executions') async executions(@Req() req: Request) { const { organizationId } = await this.auth.tenant(req); return data(this.db.priceExecution.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 100 })); }
  @Get('stores') stores(@Req() req: Request) { return data(this.platform.stores(req)); }
  @Get('torob/connection') torobState(@Req() req: Request) { return data(this.platform.torobState(req)); }
  @Put('torob/connection') torobConfigure(@Req() req: Request, @Body() body: unknown) { return data(this.platform.torobConfigure(req, body)); }
  @Post('torob/test') torobTest(@Req() req: Request) { return data(this.platform.torobRead(req)); }
  @Post('torob/catalog') torobCatalog(@Req() req: Request) { return data(this.platform.torobRead(req, true)); }
  @Post('stores') createStore(@Req() req: Request, @Body() body: unknown) { return data(this.platform.createStore(req, body)); }
  @Patch('stores/:id') updateStore(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { return data(this.platform.configureStore(req, id, body)); }
  @Post('stores/:id/test') testStore(@Req() req: Request, @Param('id') id: string) { return data(this.platform.testStore(req, id)); }
  @Post('stores/:id/sync') syncStore(@Req() req: Request, @Param('id') id: string) { return data(this.platform.syncStore(req, id)); }
  @Get('billing') billing(@Req() req: Request) { return data(this.platform.billing(req)); }
  @Post('billing/quote') quote(@Body() body: unknown) { return data(this.platform.quote(body)); }
  @Get('organization') async organization(@Req() req: Request) { const context = await this.auth.tenant(req); return data(context.organization); }
  @Patch('organization') async updateOrganization(@Req() req: Request, @Body() body: unknown) {
    const { organizationId, user } = await this.auth.tenant(req, ['OWNER', 'ADMIN']);
    const input = parse(z.object({ name: z.string().trim().min(2).max(100).optional(), emergencyStop: z.boolean().optional() }), body);
    const organization = await this.db.organization.update({ where: { id: organizationId }, data: input });
    await this.platform.audit(organizationId, user.id, input.emergencyStop ? 'organization.emergency_stop' : 'organization.update', organizationId, input);
    return data(organization);
  }
  @Get('team') async team(@Req() req: Request) { const { organizationId } = await this.auth.tenant(req); return data(this.db.membership.findMany({ where: { organizationId }, include: { user: { select: { id: true, name: true, email: true, phone: true } } } })); }
  @Get('audit') async audit(@Req() req: Request) { const { organizationId } = await this.auth.tenant(req); return data(this.db.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 100 })); }
  @Get('admin/settings') async adminSettings(@Req() req: Request) { await this.auth.admin(req); return data({ ...await this.settings.get(), providers: { sms: { provider: process.env.SMS_PROVIDER ?? 'none', configured: this.auth.smsReady(), username: process.env.MELIPAYAMAK_USERNAME ? '••••' : null, bodyIdConfigured: !!process.env.MELIPAYAMAK_BODY_ID }, email: { status: 'awaiting_configuration' }, payment: { status: 'awaiting_configuration' } } }); }
  @Put('admin/settings') updateSettings(@Req() req: Request, @Body() body: unknown) { return data(this.platform.updateSettings(req, body)); }
  @Get('admin/overview') async adminOverview(@Req() req: Request) {
    await this.auth.admin(req);
    const [organizations, users, products, stores, activeSubscriptions, trials, failedExecutions, recentActivity] = await Promise.all([this.db.organization.count(), this.db.user.count(), this.db.product.count(), this.db.store.count(), this.db.subscription.count({ where: { status: 'ACTIVE', endsAt: { gt: new Date() } } }), this.db.subscription.count({ where: { status: 'TRIAL', endsAt: { gt: new Date() } } }), this.db.priceExecution.count({ where: { status: 'RECONCILIATION_REQUIRED' } }), this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })]);
    return data({ organizations, users, products, stores, activeSubscriptions, trials, failedExecutions, recentActivity, paymentStatus: 'awaiting_configuration' });
  }
}
