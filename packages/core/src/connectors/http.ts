import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';

export interface ResolvedAddress { address: string; family: number }
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;
export const resolvePublic: Resolver = hostname => lookup(hostname, {all: true, verbatim: true});
const denied = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) denied.addSubnet(network, prefix, 'ipv4');
denied.addSubnet('2001::', 23, 'ipv6');
denied.addSubnet('2001:db8::', 32, 'ipv6');
denied.addSubnet('2002::', 16, 'ipv6');
denied.addSubnet('3fff::', 20, 'ipv6');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !denied.check(address, 'ipv4');
  if (version === 6) return globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
  return false;
}
export async function validatePublicHttpsUrl(raw: string, resolver: Resolver = resolvePublic): Promise<{url: URL; address: ResolvedAddress}> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('INVALID_STORE_URL'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hash) throw new Error('HTTPS_PUBLIC_URL_REQUIRED');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname.toLowerCase() === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('PRIVATE_DESTINATION_REJECTED');
  const addresses = isIP(hostname) ? [{address: hostname, family: isIP(hostname)}] : await resolver(hostname);
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('PRIVATE_DESTINATION_REJECTED');
  return {url, address: addresses[0]!};
}

export interface HttpRequest {url: URL; address: ResolvedAddress; method: 'GET' | 'POST' | 'PUT'; headers: Record<string, string>; body?: string}
export interface HttpResponse {status: number; headers: Record<string, string | string[] | undefined>; body: string}
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/** DNS address is validated then pinned into the TLS connection, eliminating DNS rebinding. */
export const secureHttpTransport: HttpTransport = input => new Promise((resolve, reject) => {
  const req = request(input.url, {
    method: input.method, headers: {...input.headers, ...(input.body ? {'Content-Length': String(Buffer.byteLength(input.body))} : {})},
    family: input.address.family, agent: false,
    lookup: (_host, _options, callback) => callback(null, input.address.address, input.address.family),
    timeout: 15_000, rejectUnauthorized: true,
  }, response => {
    let size = 0;
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) { req.destroy(new Error('REMOTE_RESPONSE_TOO_LARGE')); return; }
      chunks.push(chunk);
    });
    response.on('end', () => resolve({status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8')}));
    response.on('error', () => reject(new Error('REMOTE_RESPONSE_ERROR')));
  });
  req.on('timeout', () => req.destroy(new Error('REMOTE_REQUEST_TIMEOUT')));
  req.on('error', error => reject(new Error(error.message === 'REMOTE_RESPONSE_TOO_LARGE' ? error.message : 'REMOTE_REQUEST_FAILED')));
  if (input.body) req.write(input.body);
  req.end();
});

export function parseJson(body: string): unknown {
  try { return JSON.parse(body) as unknown; } catch { throw new Error('INVALID_REMOTE_JSON'); }
}

