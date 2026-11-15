import { normalizePhone } from '../matching.js';
import type { ConnectionResult, SmsProvider, SmsResult } from '../types.js';
import { type HttpTransport, type Resolver, parseJson, resolvePublic, secureHttpTransport, validatePublicHttpsUrl } from './http.js';

export interface MelliPayamakConfig {
  username: string;
  /** Provider field is named password, but current provider instructions require the panel API key. */
  password: string;
  bodyId: number;
}
interface ProviderEnvelope {Value?: unknown; RetStatus?: unknown}
const BASE = 'https://rest.payamak-panel.com/api/SendSMS/';
export class MelliPayamakProvider implements SmsProvider {
  constructor(private readonly config: MelliPayamakConfig, private readonly transport: HttpTransport = secureHttpTransport, private readonly resolver: Resolver = resolvePublic) {}
  validateConfiguration(): ConnectionResult {
    return this.config.username.trim() && this.config.password.trim() && Number.isSafeInteger(this.config.bodyId) && this.config.bodyId > 0
      ? {ok: true, status: 'CONFIGURED_UNVERIFIED', message: 'پیکربندی ثبت شد؛ کلید API، تأیید پترن و ارسال واقعی هنوز تأیید نشده است.'}
      : {ok: false, status: 'AWAITING_CREDENTIALS', message: 'نام کاربری، کلید API و شناسه پترن تأییدشده لازم است.'};
  }
  private async call(method: 'BaseServiceNumber' | 'GetCredit', params: Record<string, string>): Promise<ProviderEnvelope> {
    if (!this.validateConfiguration().ok) throw new Error('SMS_CONFIGURATION_REQUIRED');
    const {url, address} = await validatePublicHttpsUrl(`${BASE}${method}`, this.resolver);
    const body = new URLSearchParams({username: this.config.username, password: this.config.password, ...params}).toString();
    const response = await this.transport({url, address, method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json'}, body});
    if (response.status < 200 || response.status >= 300) throw new Error(`SMS_HTTP_${response.status}`);
    const parsed = parseJson(response.body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_SMS_RESPONSE');
    return parsed as ProviderEnvelope;
  }
  /** Never retry a send automatically: a timed-out request may already have reached the recipient. */
  async sendOtp(phone: string, code: string): Promise<SmsResult> {
    if (!/^\d{4,8}$/.test(code)) throw new Error('INVALID_OTP');
    const to = normalizePhone(phone).replace('+98', '0');
    const result = await this.call('BaseServiceNumber', {to, text: code, bodyId: String(this.config.bodyId)});
    // A receipt is more than 15 digits; numeric error codes (including positive codes) are not receipts.
    if (result.RetStatus === 1 && typeof result.Value === 'string' && /^\d{16,25}$/.test(result.Value)) return {status: 'accepted', providerId: result.Value};
    const errorCode = typeof result.Value === 'string' && /^-?\d{1,6}$/.test(result.Value) ? result.Value : 'INVALID_PROVIDER_RESPONSE';
    return {status: 'failed', errorCode};
  }
  async testConnection(): Promise<ConnectionResult> {
    try {
      const result = await this.call('GetCredit', {});
      if (result.RetStatus !== 1 || typeof result.Value !== 'string' || !/^\d+(\.\d+)?$/.test(result.Value)) throw new Error('SMS_AUTHENTICATION_FAILED');
      return {ok: true, status: 'CONNECTED', message: 'اعتبار حساب خوانده شد؛ این نتیجه تأیید پترن یا تحویل پیامک نیست.'};
    } catch (error) {return {ok: false, status: 'FAILED', message: error instanceof Error ? error.message : 'SMS_CONNECTION_FAILED'};}
  }
}

/** Explicit dependency-injected test provider; never instantiate from production configuration. */
export class TestSmsProvider implements SmsProvider {
  readonly messages: {phone: string; code: string}[] = [];
  constructor() {if (process.env.NODE_ENV === 'production') throw new Error('TEST_SMS_FORBIDDEN_IN_PRODUCTION');}
  async sendOtp(phone: string, code: string): Promise<SmsResult> {this.messages.push({phone: normalizePhone(phone), code}); return {status: 'accepted', providerId: `test-${this.messages.length}`};}
  async testConnection(): Promise<ConnectionResult> {return {ok: true, status: 'CONFIGURED_UNVERIFIED', message: 'TEST PROVIDER — no SMS is sent'};}
}
