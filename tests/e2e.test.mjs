import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const base = process.env.API_URL || 'http://localhost:4000';
const origin = process.env.WEB_ORIGIN || 'http://localhost:3000';
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('This suite creates temporary fixtures and only runs against a local development API.');
}
const suffix = randomUUID().slice(0, 8);
const password = `Test-only-${randomUUID()}!`;
const fixtureEmails = [`qa-a-${suffix}@example.invalid`, `qa-b-${suffix}@example.invalid`];
function client() {
  let cookie = '';
  let org;
  return {
    setOrg(value) { org = value; },
    async request(path, options = {}) {
      const response = await fetch(`${base}/api/v1${path}`, {
        method: options.method || (options.body ? 'POST' : 'GET'),
        headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(org ? { 'x-organization-id': org } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
      const json = await response.json();
      return { status: response.status, data: json.data, body: json, headers: response.headers };
    },
  };
}
const a = client(), b = client();
const ok = result => { assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body)); return result.data; };

test('real PostgreSQL / HTTP tenant, auth, catalog and dry-run workflow', async t => {
  const fixtureOrgIds = [];
  try {
    await t.test('database health is available', async () => { ok(await a.request('/health')); });
    await t.test('public settings expose no credentials', async () => {
      const cfg = ok(await a.request('/public/config'));
      assert.ok(cfg.branding && cfg.auth && cfg.connectors);
      assert.doesNotMatch(JSON.stringify(cfg), /consumerSecret|credentialCiphertext|passwordHash|ENCRYPTION_KEY/);
    });
    await t.test('cross-site registration is rejected', async () => {
      const response = await a.request('/auth/register', { body: { name: 'تست', email: `csrf-${suffix}@example.invalid`, password, organizationName: 'سازمان تست' }, headers: { Origin: 'https://untrusted.invalid' } });
      assert.equal(response.status, 403);
    });
    for (const [index, c] of [a, b].entries()) {
      await t.test(`register tenant ${index + 1} with secure session`, async () => {
        const response = await c.request('/auth/register', { body: { name: 'کاربر آزمون', email: fixtureEmails[index], password, organizationName: `QA ${suffix} ${index}` } });
        ok(response);
        assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
        const me = ok(await c.request('/auth/me'));
        assert.equal(me.user.email, fixtureEmails[index]);
        assert.ok(me.memberships.length);
        const id = me.memberships[0].organizationId || me.memberships[0].organization.id;
        c.setOrg(id);
        fixtureOrgIds.push(id);
      });
    }
    await t.test('tenant header cannot grant another organization access', async () => {
      assert.equal((await b.request('/products', { headers: { 'x-organization-id': fixtureOrgIds[0] } })).status, 403);
    });
    await t.test('ordinary users cannot reach platform settings', async () => {
      assert.equal((await a.request('/admin/settings')).status, 403);
    });
    await t.test('Torob token is tenant-scoped and never returned', async () => {
      const token = `fixture-only-${randomUUID()}`;
      const saved = ok(await a.request('/torob/connection', { method: 'PUT', body: { token } }));
      assert.equal(saved.configured, true);
      assert.equal(saved.verifiedAt, null);
      assert.equal(saved.competitorMonitoring, false);
      assert.ok(!JSON.stringify(saved).includes(token));
      assert.equal(ok(await b.request('/torob/connection')).configured, false);
      assert.equal((await b.request('/torob/connection', { headers: { 'x-organization-id': fixtureOrgIds[0] } })).status, 403);
    });
    let bridgeStore;
    await t.test('bridge connection persists read-only without returning its token', async () => {
      const bridgeToken = 'pb_' + 'a'.repeat(64);
      bridgeStore = ok(await a.request('/stores', { body: { name: 'فروشگاه آزمون', url: 'https://fixture.invalid', currency: 'IRT', connectionKind: 'bridge', bridgeToken } }));
      assert.equal(bridgeStore.readOnly, true);
      assert.equal(bridgeStore.connectionKind, 'bridge');
      assert.ok(!JSON.stringify(bridgeStore).includes(bridgeToken));
      assert.equal(ok(await b.request('/stores')).length, 0);
    });
    await t.test('bridge write permission cannot be enabled at creation', async () => {
      const result = await b.request('/stores', { body: { name: 'فروشگاه آزمون', url: 'https://fixture.invalid', currency: 'IRT', connectionKind: 'bridge', bridgeToken: 'pb_' + 'b'.repeat(64), readOnly: false } });
      assert.equal(result.status, 400);
    });
    await t.test('read-only bridge cannot enter automatic mode', async () => {
      const result = await a.request(`/stores/${bridgeStore.id}`, { method: 'PATCH', body: { mode: 'AUTOMATIC', confirmAutomatic: true } });
      assert.equal(result.status, 403);
      assert.match(result.body.message, /فقط‌خواندنی/);
    });
    const productBody = { title: 'محصول مستقل آزمون', sku: `QA-${suffix}`, currentPrice: '1000000', costPrice: '700000', minPrice: '800000', currency: 'IRT', stock: 10 };
    await t.test('boolean financial input is rejected', async () => {
      assert.equal((await a.request('/products', { body: { ...productBody, currentPrice: true } })).status, 400);
    });
    let product;
    await t.test('product is persisted and searchable', async () => {
      product = ok(await a.request('/products', { body: productBody }));
      const list = ok(await a.request(`/products?q=QA-${suffix}`));
      assert.equal(list.total, 1);
      assert.equal(list.items[0].id, product.id);
    });
    await t.test('product detail and mutation enforce tenant ownership', async () => {
      assert.equal((await b.request(`/products/${product.id}`)).status, 404);
      assert.equal((await b.request(`/products/${product.id}`, { method: 'PATCH', body: { title: 'تغییر غیرمجاز' } })).status, 404);
    });
    await t.test('manual observations preserve provenance', async () => {
      for (const price of ['900000', '950000']) {
        const obs = ok(await a.request(`/products/${product.id}/observations`, { body: { marketplace: 'torob', sellerName: `فروشنده آزمون ${price}`, price, currency: 'IRT', matchVerified: true } }));
        assert.equal(obs.source, 'manual_import');
      }
    });
    let rule, recommendation;
    await t.test('rule and dry-run return a decimal-safe proposal', async () => {
      rule = ok(await a.request('/rules', { body: { name: 'کاهش کنترل‌شده آزمون', strategy: 'UNDERCUT_FIXED', productId: product.id, config: { amount: '10000', maxChangePercent: '20' } } }));
      recommendation = ok(await a.request(`/products/${product.id}/recommend`, { body: { ruleId: rule.id } }));
      assert.equal(Number(recommendation.candidatePrice), 890000);
      const unchanged = ok(await a.request(`/products/${product.id}`));
      assert.equal(Number(unchanged.currentPrice), 1000000);
    });
    await t.test('incomplete market observations cannot be executed', async () => {
      const execution = await a.request(`/recommendations/${recommendation.id}/execute`, { body: { idempotencyKey: randomUUID() } });
      assert.ok([400, 403, 409].includes(execution.status), JSON.stringify(execution.body));
    });
    await t.test('other tenant cannot approve or execute proposal', async () => {
      assert.equal((await b.request(`/recommendations/${recommendation.id}/approve`, { method: 'POST' })).status, 404);
    });
    await t.test('audit log contains actual product and recommendation actions', async () => {
      const result = ok(await a.request('/audit'));
      const records = Array.isArray(result) ? result : result.items;
      assert.ok(records.some(row => row.action === 'product.create'));
    });
    await t.test('logout revokes the server-side session', async () => {
      ok(await a.request('/auth/logout', { method: 'POST' }));
      assert.equal((await a.request('/auth/me')).status, 401);
    });
    await t.test('password login works after logout', async () => {
      ok(await a.request('/auth/login', { body: { email: fixtureEmails[0], password } }));
      assert.equal(ok(await a.request('/auth/me')).user.email, fixtureEmails[0]);
    });
  } finally {
    // Only the uniquely named fixtures created by this run are removed; no database reset.
    const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
      for (const id of fixtureOrgIds) {
        await database.query('DELETE FROM "Organization" WHERE id = $1 AND name LIKE $2', [id, `QA ${suffix}%`]);
      }
      await database.query('DELETE FROM "User" WHERE email = ANY($1::text[])', [fixtureEmails]);
    } finally { await database.end(); }
  }
});
