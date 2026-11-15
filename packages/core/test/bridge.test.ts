import { describe, it, expect } from 'vitest';
import { WooCommerceConnector } from '../src/connectors/woocommerce.js';
import type { HttpRequest } from '../src/connectors/http.js';
const resolver = async () => [{ address: '8.8.8.8', family: 4 }];
const config = { storeUrl: 'https://fixture.invalid', connectionKind: 'bridge' as const, bridgeToken: 'pb_' + 'a'.repeat(64), currency: 'IRT' as const };
const row = { id: 20, name: 'fixture', type: 'simple', price: '100', currency: 'IRT', stock_status: 'instock' };
describe('WordPress bridge boundary', () => {
  it('sends a scoped token in a header and reads variants separately', async () => {
    const calls: HttpRequest[] = [];
    const connector = new WooCommerceConnector(config, async request => {
      calls.push(request);
      return { status: 200, headers: {}, body: JSON.stringify(request.url.pathname.endsWith('/variations') ? [{ ...row, id: 21, type: 'variation', price: '200' }] : [{ ...row, type: 'variable' }]) };
    }, resolver);
    const products = await connector.syncProducts();
    expect(products.map(p => [p.id, p.type, p.parentId])).toEqual([['20', 'variable', undefined], ['21', 'variation', '20']]);
    expect(calls).toHaveLength(2);
    expect(calls.every(r => r.method === 'GET' && r.url.pathname.startsWith('/wp-json/pricing-bridge/v1/') && r.headers['X-Pricing-Token'] === config.bridgeToken && !r.headers.Authorization && !r.url.href.includes(config.bridgeToken))).toBe(true);
  });
  it.each(['bridge', 'woocommerce'] as const)('blocks %s writes before any network request', async connectionKind => {
    let calls = 0;
    const connector = new WooCommerceConnector({ ...config, connectionKind, readOnly: true }, async () => { calls++; throw new Error('unexpected request'); }, resolver);
    await expect(connector.updatePrice({ productId: '20', price: '200', expectedPrice: '100', currency: 'IRT' })).rejects.toThrow('STORE_READ_ONLY');
    expect(calls).toBe(0);
  });
  it('cannot enable bridge writes even by setting readOnly false', async () => {
    const connector = new WooCommerceConnector({ ...config, readOnly: false });
    await expect(connector.updatePrice({ productId: '20', price: '200', expectedPrice: '100', currency: 'IRT' })).rejects.toThrow('STORE_READ_ONLY');
  });
  it('rejects a mismatched real store currency during connection test', async () => {
    const connector = new WooCommerceConnector(config, async () => ({ status: 200, headers: {}, body: JSON.stringify([{ ...row, currency: 'IRR' }]) }), resolver);
    expect(await connector.testConnection()).toMatchObject({ ok: false, message: 'CURRENCY_MISMATCH' });
  });
});
