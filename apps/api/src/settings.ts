import { Injectable } from '@nestjs/common';
import { Db } from './db.js';

export const DEFAULT_SETTINGS = {
  branding: { name: 'Pricing Platform', title: 'هوشمندی قیمت، با کنترل شما', subtitle: 'پایش بازار و قیمت‌گذاری با حفاظت از سود', primaryColor: '#156a50', secondaryColor: '#d8ef8c', supportEmail: '', logoUrl: '', faviconUrl: '', description: 'پایش قیمت و مدیریت فروشگاه‌های اینترنتی', supportPhone: '' },
  auth: { emailEnabled: true, otpEnabled: false, registrationEnabled: true, requireEmailVerification: false, otpExpirySeconds: 120, otpCooldownSeconds: 60, otpMaxAttempts: 5, sessionHours: 24 },
  billing: { baseMonthly: '1500000', perProductMonthly: '10000', checksPerDayOptions: [1, 2, 3, 4], durationDiscounts: { '1': 0, '3': 5, '6': 10 } as Record<string, number>, trialDays: 14, trialProductLimit: 100, trialStoreLimit: 1, trialMemberLimit: 3 },
};
export type Settings = typeof DEFAULT_SETTINGS;
@Injectable()
export class SettingsService {
  constructor(private readonly db: Db) {}
  async get(): Promise<Settings> {
    const setting = await this.db.platformSetting.findUnique({ where: { key: 'platform' } });
    const stored = (setting?.value ?? {}) as Partial<Settings>;
    return { branding: { ...DEFAULT_SETTINGS.branding, ...stored.branding }, auth: { ...DEFAULT_SETTINGS.auth, ...stored.auth }, billing: { ...DEFAULT_SETTINGS.billing, ...stored.billing } };
  }
  async save(value: Settings) {
    return this.db.platformSetting.upsert({ where: { key: 'platform' }, create: { key: 'platform', value }, update: { value, version: { increment: 1 } } });
  }
}
