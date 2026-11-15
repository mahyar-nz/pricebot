import type { Currency, MarketOffer, MarketQuality, MarketSnapshot } from './types.js';
import { convertCurrency, nonNegative } from './money.js';

export function analyzeMarketQuality(offers: MarketOffer[], snapshot: MarketSnapshot | undefined, currency: Currency, now: string, maxAgeSeconds: number, eligibleIds: string[]): MarketQuality {
  const nowMs = Date.parse(now);
  const validIds = new Set(eligibleIds);
  const counted = new Set<string>();
  const eligible = offers.filter(o => {if (!validIds.has(o.id) || counted.has(o.id)) return false; counted.add(o.id); return true;});
  const prices = eligible.map(o => nonNegative(convertCurrency(o.price, o.currency, currency))).sort((a,b) => a.cmp(b));
  const stale = offers.filter(o => {
    const timestamp = Date.parse(o.observedAt);
    return !Number.isFinite(timestamp) || timestamp > nowMs || nowMs - timestamp > maxAgeSeconds * 1000;
  }).length;
  const reasons: string[] = [];
  let completeness: MarketQuality['completeness'] = 'UNKNOWN';
  const reported = snapshot?.reportedOffers;
  const reportedSellers = snapshot?.reportedSellers;
  if (reported !== null && reported !== undefined && (!Number.isSafeInteger(reported) || reported < 0)) reasons.push('INVALID_REPORTED_COUNT');
  else if (!snapshot || reported === null || reported === undefined) reasons.push('REPORTED_COUNT_UNKNOWN');
  else {
    const collectedTime = snapshot.collectedAt ? Date.parse(snapshot.collectedAt) : NaN;
    const fresh = Number.isFinite(collectedTime) && collectedTime <= nowMs && nowMs - collectedTime <= maxAgeSeconds * 1000;
    if (!fresh || stale > 0) {completeness = 'STALE'; reasons.push('COLLECTION_FRESHNESS_UNVERIFIED');}
    else if (offers.length !== reported || !snapshot.terminalEvidence?.trim()) {completeness = 'PARTIAL'; reasons.push(offers.length !== reported ? 'REPORTED_COLLECTED_MISMATCH' : 'NO_TERMINAL_EVIDENCE');}
    else completeness = 'COMPLETE';
  }
  if (reportedSellers !== null && reportedSellers !== undefined && (!Number.isSafeInteger(reportedSellers) || reportedSellers < 0)) {
    reasons.push('INVALID_REPORTED_SELLER_COUNT');
    if (completeness === 'COMPLETE') completeness = 'PARTIAL';
  }
  let sourceLowestPrice: string | null = null;
  if (snapshot?.sourceLowestPrice !== undefined) {
    try {sourceLowestPrice = nonNegative(convertCurrency(snapshot.sourceLowestPrice, snapshot.currency, currency)).toFixed();} catch {reasons.push('INVALID_SOURCE_LOWEST_PRICE'); completeness = 'PARTIAL';}
  }
  const collectedLowestPrice = prices[0]?.toFixed() ?? null;
  if (sourceLowestPrice !== null && collectedLowestPrice !== null && nonNegative(sourceLowestPrice).lt(nonNegative(collectedLowestPrice))) {
    reasons.push('SOURCE_LOWEST_NOT_COLLECTED');
    if (completeness === 'COMPLETE') completeness = 'PARTIAL';
  }
  if (sourceLowestPrice !== null && collectedLowestPrice !== null && nonNegative(sourceLowestPrice).gt(nonNegative(collectedLowestPrice))) {
    reasons.push('SOURCE_LOWEST_CONTRADICTS_COLLECTED');
    if (completeness === 'COMPLETE') completeness = 'PARTIAL';
  }
  const uniqueSellers = new Set(offers.map(o => o.sellerId).filter(Boolean)).size;
  if (typeof reportedSellers === 'number' && reportedSellers !== uniqueSellers) {
    reasons.push('REPORTED_SELLER_COUNT_MISMATCH');
    if (completeness === 'COMPLETE') completeness = 'PARTIAL';
  }
  if (!offers.length) {completeness = 'UNKNOWN'; reasons.push('NO_COLLECTED_OFFERS');}
  if (new Set(offers.map(o => o.id)).size !== offers.length) {reasons.push('DUPLICATE_OFFER_IDENTIFIERS'); if (completeness === 'COMPLETE') completeness = 'PARTIAL';}
  return {completeness, reportedOffers: typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= 0 ? reported : null, reportedSellers: typeof reportedSellers === 'number' && Number.isSafeInteger(reportedSellers) && reportedSellers >= 0 ? reportedSellers : null, collectedOffers: offers.length, uniqueSellers, valid: eligible.length, filtered: offers.length - eligible.length, stale, collectedLowestPrice, sourceLowestPrice, reasons};
}
