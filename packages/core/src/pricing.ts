import { Decimal } from 'decimal.js';
import { Money, decimal, nonNegative, convertCurrency } from './money.js';
import type { MarketOffer, PricingInput, PricingResult, PricingStrategy } from './types.js';
import { analyzeMarketQuality } from './market-quality.js';

const HUNDRED = new Money(100);
const percent = (value: string, name: string): Decimal => {
  const parsed = nonNegative(value, name);
  if (parsed.gt(100)) throw new Error(`INVALID_${name.toUpperCase()}`);
  return parsed.div(HUNDRED);
};

export function calculatePrice(input: PricingInput): PricingResult {
  const result: PricingResult = {
    candidatePrice: null, netProfit: null, safe: false, violations: [],
    evidence: {currency: input.currency, eligibleOfferIds: [], excludedOfferIds: [], strategy: input.strategy.type, calculatedAt: input.safety.now, mode: 'DRY_RUN'},
  };
  try {
    if (!['IRR', 'IRT'].includes(input.currency)) throw new Error('UNSUPPORTED_CURRENCY');
    const now = Date.parse(input.safety.now);
    if (!Number.isFinite(now) || !Number.isFinite(input.safety.maxDataAgeSeconds) || input.safety.maxDataAgeSeconds <= 0) throw new Error('INVALID_SAFETY_TIME');
    if (!input.safety.tenantId) throw new Error('TENANT_REQUIRED');
    const current = nonNegative(input.currentPrice, 'current_price');
    if (current.isZero()) throw new Error('INVALID_CURRENT_PRICE');
    const cost = nonNegative(input.cost, 'cost');
    const minimum = nonNegative(input.minPrice, 'minimum_price');
    const maximum = input.maxPrice ? nonNegative(input.maxPrice, 'maximum_price') : undefined;
    if (maximum && maximum.lt(minimum)) throw new Error('INVALID_PRICE_BOUNDS');
    const fees = input.fees ?? {};
    const rate = percent(fees.commissionPercent ?? '0', 'commission').add(percent(fees.paymentPercent ?? '0', 'payment_fee')).add(percent(fees.taxPercent ?? '0', 'tax'));
    const margin = percent(fees.minMarginPercent ?? '0', 'minimum_margin');
    if (rate.add(margin).gte(1)) throw new Error('IMPOSSIBLE_PROFIT_CONSTRAINT');
    const fixedCosts = cost.add(nonNegative(fees.shipping ?? '0', 'shipping')).add(nonNegative(fees.packaging ?? '0', 'packaging')).add(nonNegative(fees.fixed ?? '0', 'fixed_costs'));
    const minProfit = nonNegative(fees.minNetProfit ?? '0', 'minimum_profit');
    const profitFloor = Money.max(fixedCosts.add(minProfit).div(new Money(1).sub(rate)), fixedCosts.div(new Money(1).sub(rate).sub(margin))).ceil();
    result.evidence.profitFloor = profitFloor.toFixed(0);

    const offers: {offer: MarketOffer; price: Decimal}[] = [];
    const seenOfferIds = new Set<string>();
    for (const offer of input.offers) {
      const age = now - Date.parse(offer.observedAt);
      if (offer.tenantId !== input.safety.tenantId) result.violations.push('CROSS_TENANT_DATA');
      try {
        const price = nonNegative(convertCurrency(offer.price, offer.currency, input.currency));
        if (seenOfferIds.has(offer.id) || (offer.sellerId && input.safety.ownSellerIds?.includes(offer.sellerId)) || offer.tenantId !== input.safety.tenantId || offer.inStock !== true || offer.verified !== true || !Number.isFinite(age) || age < 0 || age > input.safety.maxDataAgeSeconds * 1000 || price.lte(0)) {
          result.evidence.excludedOfferIds.push(offer.id);
        } else {
          offers.push({offer, price});
          result.evidence.eligibleOfferIds.push(offer.id);
        }
        seenOfferIds.add(offer.id);
      } catch { result.evidence.excludedOfferIds.push(offer.id); }
    }
    offers.sort((a, b) => a.price.cmp(b.price));
    if (offers.length >= 3) {
      const middle = Math.floor(offers.length / 2);
      const median = offers.length % 2 ? offers[middle]!.price : offers[middle-1]!.price.add(offers[middle]!.price).div(2);
      if (offers.some(o => o.price.lt(median.mul('0.2')) || o.price.gt(median.mul(5)))) result.violations.push('ANOMALOUS_MARKET_PRICE');
    }
    const prices = offers.map(row => row.price);
    const lowest = prices[0];
    const average = prices.length ? prices.reduce((sum, p) => sum.add(p), new Money(0)).div(prices.length) : undefined;
    const marketDependent = !['MARKUP', 'MARGIN'].includes(input.strategy.type) && !(input.strategy.type === 'FORMULA' && ['cost', 'current'].includes(input.strategy.formula?.base ?? ''));
    result.evidence.market = analyzeMarketQuality(input.offers, input.marketSnapshot, input.currency, input.safety.now, input.safety.maxDataAgeSeconds, result.evidence.eligibleOfferIds);
    if (marketDependent && result.evidence.market.completeness !== 'COMPLETE') result.violations.push(result.evidence.market.completeness === 'UNKNOWN' ? 'MARKET_COMPLETENESS_UNKNOWN' : 'MARKET_DATA_INCOMPLETE');
    if (marketDependent && !input.safety.matchVerified) result.violations.push('UNVERIFIED_MATCH');
    if (marketDependent && !lowest) throw new Error('NO_ELIGIBLE_MARKET_DATA');
    const strategy = input.strategy;
    let candidate: Decimal;
    switch (strategy.type) {
      case 'MATCH_LOWEST': candidate = lowest!; break;
      case 'UNDERCUT_FIXED': candidate = lowest!.sub(nonNegative(strategy.amount ?? '0')); break;
      case 'UNDERCUT_PERCENT': candidate = lowest!.mul(new Money(1).sub(percent(strategy.percent ?? '0', 'undercut'))); break;
      case 'AVERAGE': candidate = average!; break;
      case 'MEDIAN': {
        const midpoint = Math.floor(prices.length / 2);
        candidate = prices.length % 2 ? prices[midpoint]! : prices[midpoint - 1]!.add(prices[midpoint]!).div(2);
        break;
      }
      case 'TARGET_SELLER': {
        const offer = offers.find(row => row.offer.sellerId === strategy.targetSellerId);
        if (!strategy.targetSellerId || !offer) throw new Error('TARGET_SELLER_UNAVAILABLE');
        candidate = offer.price; break;
      }
      case 'TARGET_RANK': {
        if (!Number.isInteger(strategy.rank) || strategy.rank! < 1 || strategy.rank! > prices.length) throw new Error('INSUFFICIENT_RANK_DATA');
        candidate = prices[strategy.rank! - 1]!.sub(nonNegative(strategy.amount ?? '1')); break;
      }
      case 'MARKUP': candidate = fixedCosts.mul(new Money(1).add(nonNegative(strategy.percent ?? '0').div(100))); break;
      case 'MARGIN': {
        const target = percent(strategy.percent ?? '0', 'target_margin');
        if (rate.add(target).gte(1)) throw new Error('IMPOSSIBLE_MARGIN');
        candidate = fixedCosts.div(new Money(1).sub(rate).sub(target)).ceil(); break;
      }
      case 'RAISE_TO_MARKET': candidate = Money.max(current, lowest!.sub(nonNegative(strategy.amount ?? '0'))); break;
      case 'FORMULA': {
        if (!strategy.formula) throw new Error('FORMULA_REQUIRED');
        const base = {cost: fixedCosts, lowest, average, current}[strategy.formula.base];
        if (!base) throw new Error('INVALID_FORMULA_BASE');
        candidate = base.mul(nonNegative(strategy.formula.multiplier)).add(decimal(strategy.formula.offset)); break;
      }
      default: throw new Error('UNSUPPORTED_STRATEGY');
    }
    candidate = candidate.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    result.candidatePrice = candidate.toFixed(0);
    result.netProfit = candidate.mul(new Money(1).sub(rate)).sub(fixedCosts).toFixed(4);
    const change = candidate.sub(current).abs().div(current).mul(100);
    result.evidence.changePercent = change.toFixed(4);
    if (candidate.lte(0)) result.violations.push('NON_POSITIVE_PRICE');
    if (candidate.lt(minimum)) result.violations.push('BELOW_MINIMUM_PRICE');
    if (maximum && candidate.gt(maximum)) result.violations.push('ABOVE_MAXIMUM_PRICE');
    if (candidate.lt(profitFloor)) result.violations.push('PROFIT_CONSTRAINT');
    if (change.gt(nonNegative(input.safety.maxChangePercent))) result.violations.push('MAX_CHANGE_EXCEEDED');
    result.violations.push(...evaluateSafety(input));
    if (input.safety.dailyOpeningPrice !== undefined || input.safety.maxDailyChangePercent !== undefined) {
      if (!input.safety.dailyOpeningPrice || input.safety.maxDailyChangePercent === undefined) throw new Error('DAILY_SAFETY_INCOMPLETE');
      const opening = nonNegative(input.safety.dailyOpeningPrice);
      if (opening.lte(0)) throw new Error('INVALID_DAILY_OPENING_PRICE');
      if (candidate.sub(opening).abs().div(opening).mul(100).gt(nonNegative(input.safety.maxDailyChangePercent))) result.violations.push('MAX_DAILY_CHANGE_EXCEEDED');
    }
  } catch (error) {
    result.violations.push(error instanceof Error ? error.message : 'INVALID_CALCULATION');
  }
  result.violations = [...new Set(result.violations)];
  result.safe = result.violations.length === 0 && result.candidatePrice !== null;
  return result;
}

/** Re-run with fresh database facts immediately before an authorized connector call. */
export function evaluateSafety(input: PricingInput): string[] {
  const s = input.safety;
  const failures: string[] = [];
  if (s.subscriptionActive !== true) failures.push('SUBSCRIPTION_INACTIVE');
  if (s.automationEnabled !== true) failures.push('AUTOMATION_DISABLED');
  if (s.connectionEnabled !== true) failures.push('CONNECTION_DISABLED');
  if (s.hasPermission !== true) failures.push('PERMISSION_DENIED');
  if (s.emergencyStop) failures.push('EMERGENCY_STOP');
  if (s.circuitBreakerOpen) failures.push('CIRCUIT_BREAKER_OPEN');
  if (s.expectedVersion !== undefined && s.expectedVersion !== s.currentVersion) failures.push('VERSION_CONFLICT');
  if (s.cooldownSeconds !== undefined && (!Number.isFinite(s.cooldownSeconds) || s.cooldownSeconds < 0)) failures.push('INVALID_COOLDOWN');
  if (s.lastChangedAt) {
    const age = Date.parse(s.now) - Date.parse(s.lastChangedAt);
    if (!Number.isFinite(age) || age < 0 || age < (s.cooldownSeconds ?? 0) * 1000) failures.push('COOLDOWN_ACTIVE');
  }
  return failures;
}

export interface ScopedRule { id: string; scope: 'ORGANIZATION' | 'STORE' | 'MARKETPLACE' | 'CATEGORY' | 'PRODUCT'; priority: number; enabled: boolean; strategy: PricingStrategy }
/** Caller supplies only rules matching the tenant/store/market/category/product. */
export function resolveRule(rules: ScopedRule[]): ScopedRule | null {
  const precedence = {ORGANIZATION: 0, STORE: 1, MARKETPLACE: 2, CATEGORY: 3, PRODUCT: 4};
  return [...rules].filter(rule => rule.enabled).sort((a, b) => precedence[b.scope] - precedence[a.scope] || b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
}
