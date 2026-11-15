import 'reflect-metadata';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiController } from './controller.js';
import { Db } from './db.js';
import { AuthService } from './auth.js';
import { PlatformService } from './platform.js';
import { SettingsService } from './settings.js';
import { checkOrigin } from './security.js';
import { env, validateEnvironment } from './env.js';

@Module({ controllers: [ApiController], providers: [Db, AuthService, PlatformService, SettingsService], exports: [Db, AuthService, PlatformService, SettingsService] })
export class AppModule {}

@Catch()
class SafeErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    let status = exception instanceof HttpException ? exception.getStatus() : 500;
    let message = exception instanceof HttpException ? exception.message : 'خطای داخلی؛ شناسه درخواست را به پشتیبانی اعلام کنید.';
    const code = (exception as { code?: string })?.code;
    if (code === 'P2002') { status = 409; message = 'این رکورد یا کلید عملیات قبلاً ثبت شده است.'; }
    if (code === 'P2025') { status = 404; message = 'رکورد یافت نشد.'; }
    if (status === 500) console.error(JSON.stringify({ level: 'error', requestId: response.getHeader('x-request-id'), path: request.path, errorType: exception instanceof Error ? exception.name : 'UnknownError' }));
    response.status(status).json({ message, statusCode: status, requestId: response.getHeader('x-request-id') });
  }
}
export async function createApplication() {
  validateEnvironment();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: env.origin, credentials: true, allowedHeaders: ['content-type', 'x-organization-id'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'] });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('x-request-id', randomUUID());
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'no-referrer');
    if (env.production) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    try { checkOrigin(req); next(); } catch { res.status(403).json({ message: 'مبدأ درخواست معتبر نیست.', statusCode: 403 }); }
  });
  app.useGlobalFilters(new SafeErrorFilter());
  app.enableShutdownHooks();
  return app;
}
