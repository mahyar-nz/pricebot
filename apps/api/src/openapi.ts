const publicRoutes = new Set(['GET /health', 'GET /openapi.json', 'GET /public/config', 'GET /connectors', 'POST /auth/register', 'POST /auth/login', 'POST /auth/otp/request', 'POST /auth/otp/verify', 'POST /billing/quote']);
const routes = [
  'GET /health', 'GET /public/config', 'GET /connectors',
  'GET /torob/connection', 'PUT /torob/connection', 'POST /torob/test', 'POST /torob/catalog',
  'POST /auth/register', 'POST /auth/login', 'GET /auth/me', 'POST /auth/logout', 'POST /auth/logout-all', 'POST /auth/otp/request', 'POST /auth/otp/verify', 'GET /auth/sessions',
  'GET /dashboard', 'GET /products', 'POST /products', 'GET /products/{id}', 'PATCH /products/{id}', 'POST /products/{id}/observations', 'POST /products/{id}/recommend',
  'GET /rules', 'POST /rules', 'GET /recommendations', 'POST /recommendations/{id}/approve', 'POST /recommendations/{id}/execute', 'GET /executions',
  'GET /stores', 'POST /stores', 'PATCH /stores/{id}', 'POST /stores/{id}/test', 'POST /stores/{id}/sync', 'GET /billing', 'POST /billing/quote',
  'GET /organization', 'PATCH /organization', 'GET /team', 'GET /audit', 'GET /admin/settings', 'PUT /admin/settings', 'GET /admin/overview',
];
const paths: Record<string, Record<string, unknown>> = {};
for (const route of routes) {
  const [method, path] = route.split(' ');
  const isPublic = publicRoutes.has(route);
  const tenant = !isPublic && !path.startsWith('/auth') && !path.startsWith('/admin');
  const parameters: unknown[] = [];
  if (path.includes('{id}')) parameters.push({ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
  if (tenant) parameters.push({ name: 'x-organization-id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' }, description: 'An organization membership is verified on every request.' });
  if (method !== 'GET') parameters.push({ name: 'Origin', in: 'header', required: true, schema: { type: 'string' }, description: 'Must equal configured WEB_ORIGIN (CSRF protection).' });
  paths[path] ??= {};
  paths[path][method.toLowerCase()] = { operationId: `${method.toLowerCase()}${path.replace(/[^a-zA-Z]/g, '_')}`, tags: [path.split('/')[1]], security: isPublic ? [] : [{ session: [] }], parameters, responses: { [method === 'POST' ? '201' : '200']: { description: 'Success, wrapped in {data}. Monetary amounts are decimal strings with explicit IRR or IRT currency.', content: { 'application/json': { schema: { type: 'object', required: ['data'], properties: { data: {} } } } } }, '400': { description: 'Validation or operation rejection' }, '401': { description: 'Session missing or expired' }, '403': { description: 'Permission, subscription, or origin check failed' }, '409': { description: 'Conflict or operation already claimed' }, '429': { description: 'Rate limit exceeded' } } };
}
export const openApi = { openapi: '3.1.0', info: { title: 'Pricing Platform API', version: '0.1.0', description: 'First implementation. Detailed payload contract is in docs/api-reference.md. Live payment and unverified marketplace access are unavailable.' }, servers: [{ url: '/api/v1' }], components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'pricing_session' } } }, paths };
