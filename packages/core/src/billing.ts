import { Money, nonNegative } from './money.js';
import type { Currency } from './types.js';

export interface SubscriptionPolicy {
  version: number; currency: Currency; baseMonthlyPrice: string; pricePerProductMarketCheck: string;
  frequencies: number[]; periods: {months: number; discountPercent: string}[];
  addons: {id: string; monthlyPrice: string}[];
  maxProducts: number; maxMarkets: number;
}
export interface QuoteInput { products: number; checksPerDay: number; marketplaces: string[]; months: number; addons?: string[] }
export const DEFAULT_SUBSCRIPTION_POLICY: SubscriptionPolicy = {
  version: 1, currency: 'IRR', baseMonthlyPrice: '2900000', pricePerProductMarketCheck: '35',
  frequencies: [1, 2, 3, 4], periods: [{months: 1, discountPercent: '0'}, {months: 3, discountPercent: '10'}, {months: 6, discountPercent: '18'}],
  addons: [{id: 'advanced-analytics', monthlyPrice: '1900000'}, {id: 'extended-history', monthlyPrice: '900000'}], maxProducts: 10000, maxMarkets: 6,
};
export function calculateSubscriptionQuote(input: QuoteInput, policy: SubscriptionPolicy = DEFAULT_SUBSCRIPTION_POLICY) {
  if (!Number.isSafeInteger(input.products) || input.products < 1 || input.products > policy.maxProducts) throw new Error('INVALID_PRODUCT_COUNT');
  if (!policy.frequencies.includes(input.checksPerDay)) throw new Error('UNSUPPORTED_FREQUENCY');
  const markets = [...new Set(input.marketplaces)];
  if (!markets.length || markets.length > policy.maxMarkets) throw new Error('INVALID_MARKET_COUNT');
  const period = policy.periods.find(p => p.months === input.months);
  if (!period || !Number.isSafeInteger(period.months) || period.months < 1) throw new Error('UNSUPPORTED_PERIOD');
  const discountRate = nonNegative(period.discountPercent);
  if (discountRate.gt(100)) throw new Error('INVALID_DISCOUNT');
  const addonIds = [...new Set(input.addons ?? [])];
  let addonTotal = new Money(0);
  for (const id of addonIds) {
    const addon = policy.addons.find(a => a.id === id);
    if (!addon) throw new Error('UNKNOWN_ADDON');
    addonTotal = addonTotal.add(nonNegative(addon.monthlyPrice));
  }
  // Transparent quote policy: a billing month has 30 theoretical check days.
  const theoreticalChecksPerMonth = BigInt(input.products) * BigInt(input.checksPerDay) * BigInt(markets.length) * 30n;
  const monthlySubtotal = nonNegative(policy.baseMonthlyPrice).add(nonNegative(policy.pricePerProductMarketCheck).mul(theoreticalChecksPerMonth.toString())).add(addonTotal).ceil();
  const subtotal = monthlySubtotal.mul(period.months);
  const discount = subtotal.mul(discountRate).div(100).floor();
  return {policyVersion: policy.version, currency: policy.currency, theoreticalChecksPerMonth: theoreticalChecksPerMonth.toString(), monthlySubtotal: monthlySubtotal.toFixed(0), subtotal: subtotal.toFixed(0), discount: discount.toFixed(0), total: subtotal.sub(discount).toFixed(0), months: period.months, billablePolicy: 'RESERVED_CAPACITY_30_DAY_MONTH' as const};
}
export function enforceQuota(used: number, requested: number, limit: number): void {
  if (![used, requested, limit].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('INVALID_QUOTA');
  if (BigInt(used) + BigInt(requested) > BigInt(limit)) throw new Error('QUOTA_EXCEEDED');
}
export interface UsageEvent { operationId: string; status: 'SUCCEEDED' | 'FAILED'; cached?: boolean; units: number }
export function billableUsage(events: UsageEvent[]): number {
  const accounted = new Set<string>();
  let total = 0;
  for (const event of events) {
    if (!Number.isSafeInteger(event.units) || event.units < 0) throw new Error('INVALID_USAGE');
    if (event.status !== 'SUCCEEDED' || event.cached || accounted.has(event.operationId)) continue;
    accounted.add(event.operationId); total += event.units;
    if (!Number.isSafeInteger(total)) throw new Error('USAGE_OVERFLOW');
  }
  return total;
}
