import { describe, it, expect } from 'vitest';
import { TorobShopConnector } from '../src/connectors/torob.js';
import { WooCommerceConnector, verifyWooCommerceWebhook } from '../src/connectors/woocommerce.js';
import { validatePublicHttpsUrl, isPublicAddress, type HttpTransport, type HttpRequest } from '../src/connectors/http.js';
import { createHmac } from 'node:crypto';
const resolver = async () => [{ address: '8.8.8.8', family: 4 }];
const response = (body: unknown, status = 200) => ({ body: JSON.stringify(body), status, headers: {} });
const row = { product_id: 'own-1', price: 13140000, availability: true, statuses: [], updated_at: '2026-11-10T10:00:00Z' };
describe('Torob official owned-catalog boundary', () => {
  it('sends token only in headers and declares toman plus owned-data provenance', async () => {
    const requests: HttpRequest[] = [];
    const client = new TorobShopConnector('fixture-secret', async r => { requests.push(r); return response({ results: [row], next: null }); }, resolver);
    const products = await client.readOwnedProducts();
    expect(products[0]).toMatchObject({ price: '13140000', currency: 'IRT', source: 'torob_shop_api' });
    expect(requests[0]!.headers.Authorization).toBe('Bearer fixture-secret');
    expect(requests[0]!.url.href).not.toContain('fixture-secret');
    expect(requests[0]!.body).toBe('{}');
  });
  it.each([true, false, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '13140000', null])('rejects ambiguous price %s', async price => {
    const client = new TorobShopConnector('fixture', async () => response({ results: [{ ...row, price }], next: null }), resolver);
    await expect(client.readOwnedProducts()).rejects.toThrow('INVALID_TOROB_PRODUCT');
  });
  it.each([401, 403, 429, 500, 302])('surfaces HTTP %i without retry or false success', async status => {
    let count = 0;
    const client = new TorobShopConnector('fixture', async () => { count++; return response({}, status); }, resolver);
    await expect(client.readOwnedProducts()).rejects.toThrow(`TOROB_HTTP_${status}`);
    expect(count).toBe(1);
  });
  it('refuses credential exfiltration through next URL', async () => {
    const client = new TorobShopConnector('fixture', async () => response({ results: [row], next: 'https://attacker.invalid/?cursor=x' }), resolver);
    await expect(client.readOwnedProducts()).rejects.toThrow('UNTRUSTED_TOROB_PAGINATION');
  });
  it('follows cursor without trusting extra parameters and deduplicates overlapping pages', async () => {
    let n = 0;
    const client = new TorobShopConnector('fixture', async r => {
      n++;
      if (n === 1) return response({ results: [row], next: 'https://api.torob.com/shop-api/v1/products/?cursor=next&domain=other.invalid' });
      expect(r.url.searchParams.has('domain')).toBe(false);
      return response({ results: [{ ...row, price: 14000000, updated_at: '2026-11-11T10:00:00Z' }], next: null });
    }, resolver);
    expect(await client.readOwnedProducts()).toHaveLength(1);
    expect(n).toBe(2);
  });
});
describe('outbound URL and WooCommerce safety', () => {
  it.each(['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1'])('rejects internal IP %s', ip => expect(isPublicAddress(ip)).toBe(false));
  it.each(['http://shop.example','https://u:p@shop.example','https://shop.example:8443'])('rejects unsafe URL %s', async url => { await expect(validatePublicHttpsUrl(url, resolver)).rejects.toThrow(); });
  it('rejects mixed public/private DNS answers', async () => { await expect(validatePublicHttpsUrl('https://shop.example', async () => [{ address:'8.8.8.8', family:4 },{ address:'127.0.0.1', family:4 }])).rejects.toThrow('PRIVATE_DESTINATION'); });
  const config = { storeUrl:'https://shop.example', consumerKey:'fixture', consumerSecret:'fixture', currency:'IRT' as const };
  const product = { id:1, type:'simple', price:'1000', regular_price:'1000', sale_price:'' };
  it('stops on remote price conflict before any write', async () => {
    const calls: HttpRequest[] = [];
    const client = new WooCommerceConnector(config, async r => { calls.push(r); return response(product); }, resolver);
    await expect(client.updatePrice({ productId:'1', expectedPrice:'900', price:'1100', currency:'IRT' })).rejects.toThrow('REMOTE_PRICE_CONFLICT');
    expect(calls.every(r => r.method === 'GET')).toBe(true);
  });
  it('preserves scheduled or active sales', async () => {
    const client = new WooCommerceConnector(config, async () => response({ ...product, sale_price:'900' }), resolver);
    await expect(client.updatePrice({ productId:'1', expectedPrice:'1000', price:'1100', currency:'IRT' })).rejects.toThrow('ACTIVE_SALE');
  });
  it('verifies remote price after writing', async () => {
    let written = false;
    const transport: HttpTransport = async r => { if (r.method === 'PUT') written = true; return response({ ...product, price: written ? '1100' : '1000' }); };
    const result = await new WooCommerceConnector(config, transport, resolver).updatePrice({ productId:'1', expectedPrice:'1000', price:'1100', currency:'IRT' });
    expect(result.verified).toBe(true);
  });
  it('verifies webhook against exact raw bytes', () => {
    const body = Buffer.from('{"id":1}'); const signature = createHmac('sha256','fixture').update(body).digest('base64');
    expect(verifyWooCommerceWebhook(body,signature,'fixture')).toBe(true);
    expect(verifyWooCommerceWebhook(Buffer.from('{"id":2}'),signature,'fixture')).toBe(false);
  });
});
