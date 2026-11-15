export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = process.env.PRICEBOT_API_URL ||
    (process.env.VERCEL === '1' ? undefined : process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000');
  const headers = { 'Cache-Control': 'no-store' };

  if (base) {
    try {
      const response = await fetch(new URL('/api/v1/public/config', base), {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return Response.json(await response.json(), { headers });
    } catch {
      // The browser can still use the public API route if this service call fails.
    }
  }

  return Response.json({ message: 'دریافت تنظیمات سرویس ممکن نشد.' }, { status: 502, headers });
}
