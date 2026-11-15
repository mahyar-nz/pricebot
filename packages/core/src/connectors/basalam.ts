import { randomBytes, timingSafeEqual } from 'node:crypto';
import { type HttpTransport, type Resolver, parseJson, resolvePublic, secureHttpTransport, validatePublicHttpsUrl } from './http.js';

export interface BasalamOAuthConfig {clientId: string; clientSecret: string; redirectUri: string; scopes: string[]}
/** OAuth only. Product and price writes remain unavailable pending exact scope and endpoint verification. */
export class BasalamOAuthConnector {
  constructor(private readonly config: BasalamOAuthConfig, private readonly transport: HttpTransport = secureHttpTransport, private readonly resolver: Resolver = resolvePublic) {}
  createAuthorization(): {url: string; state: string} {
    const redirect = new URL(this.config.redirectUri);
    if (redirect.protocol !== 'https:' || redirect.hash || redirect.username || redirect.password || !this.config.clientId || !this.config.scopes.length) throw new Error('INVALID_BASALAM_CONFIGURATION');
    const state = randomBytes(32).toString('base64url');
    const url = new URL('https://basalam.com/accounts/sso');
    url.search = new URLSearchParams({client_id: this.config.clientId, scope: this.config.scopes.join(' '), redirect_uri: this.config.redirectUri, state}).toString();
    return {url: url.toString(), state};
  }
  /** expectedState must come from an unexpired, single-use, server-side session record. */
  async exchangeCode(code: string, returnedState: string, expectedState: string): Promise<{accessToken: string; refreshToken?: string; expiresIn: number}> {
    if (!code || !expectedState || returnedState.length !== expectedState.length || !timingSafeEqual(Buffer.from(returnedState), Buffer.from(expectedState))) throw new Error('OAUTH_STATE_MISMATCH');
    if (!this.config.clientSecret) throw new Error('BASALAM_CREDENTIALS_REQUIRED');
    const {url, address} = await validatePublicHttpsUrl('https://auth.basalam.com/oauth/token', this.resolver);
    const response = await this.transport({url, address, method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({grant_type: 'authorization_code', client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: this.config.redirectUri, code})});
    if (response.status < 200 || response.status >= 300) throw new Error(`BASALAM_HTTP_${response.status}`);
    const data = parseJson(response.body) as Record<string, unknown>;
    if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('INVALID_BASALAM_TOKEN_RESPONSE');
    return {accessToken: data.access_token, refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined, expiresIn: data.expires_in};
  }
}
