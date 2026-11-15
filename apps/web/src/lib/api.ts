export type ApiRecord = Record<string, any>;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T = ApiRecord>(path: string, options: RequestInit = {}, organizationId?: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(organizationId ? { 'x-organization-id': organizationId } : {}),
      ...options.headers,
    },
  });
  let payload: any;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join('، ') : payload.message;
    throw new ApiError(message || 'درخواست انجام نشد. دوباره تلاش کنید.', response.status);
  }
  return (payload.data !== undefined ? payload.data : payload) as T;
}

export const json = (method: string, value?: unknown): RequestInit => ({ method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
export const number = (value: number | string | undefined | null) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Number(value ?? 0));
export const money = (value: number | string | undefined | null, currency = 'IRR') => `${number(value)} ${currency === 'IRT' ? 'تومان' : 'ریال'}`;
export const date = (value?: string) => value ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(value)) : 'هنوز ثبت نشده';
export const rows = (value: any): ApiRecord[] => Array.isArray(value) ? value : value?.items || value?.products || value?.results || [];
