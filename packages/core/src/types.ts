export type Currency = 'IRR' | 'IRT';
export type PricingStrategyType = 'MATCH_LOWEST' | 'UNDERCUT_FIXED' | 'UNDERCUT_PERCENT' | 'AVERAGE' | 'MEDIAN' | 'TARGET_SELLER' | 'TARGET_RANK' | 'MARKUP' | 'MARGIN' | 'RAISE_TO_MARKET' | 'FORMULA';
export interface PricingStrategy {
  type: PricingStrategyType;
  amount?: string;
  percent?: string;
  targetSellerId?: string;
  rank?: number;
  /** Deliberately restricted arithmetic; no eval, scripts or arbitrary functions. */
  formula?: { base: 'cost' | 'lowest' | 'average' | 'current'; multiplier: string; offset: string };
}
export interface MarketOffer {
  id: string; tenantId: string; price: string; currency: Currency;
  inStock: boolean; verified: boolean; observedAt: string; sellerId?: string;
}
export interface PriceFees {
  commissionPercent?: string; paymentPercent?: string; taxPercent?: string;
  shipping?: string; packaging?: string; fixed?: string; minNetProfit?: string;
  minMarginPercent?: string;
}
export interface PricingSafety {
  tenantId: string; now: string; maxDataAgeSeconds: number; maxChangePercent: string;
  subscriptionActive: boolean; automationEnabled: boolean; connectionEnabled: boolean;
  hasPermission: boolean; emergencyStop: boolean; matchVerified: boolean;
  cooldownSeconds?: number; lastChangedAt?: string;
  expectedVersion?: number; currentVersion?: number;
  dailyOpeningPrice?: string; maxDailyChangePercent?: string;
  circuitBreakerOpen?: boolean;
  ownSellerIds?: string[];
}
export interface PricingInput {
  currency: Currency; currentPrice: string; cost: string; minPrice: string; maxPrice?: string;
  strategy: PricingStrategy; offers: MarketOffer[]; fees?: PriceFees; safety: PricingSafety;
  /** Source-supplied collection evidence, never inferred from a page's announced counts. */
  marketSnapshot?: MarketSnapshot;
}
export interface MarketSnapshot {
  reportedOffers: number | null; reportedSellers?: number | null; terminalEvidence?: string;
  collectedAt?: string; sourceLowestPrice?: string; currency: Currency;
}
export interface MarketQuality {
  completeness: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'STALE';
  reportedOffers: number | null; reportedSellers: number | null;
  collectedOffers: number; uniqueSellers: number; valid: number; filtered: number; stale: number;
  collectedLowestPrice: string | null; sourceLowestPrice: string | null;
  reasons: string[];
}
export interface PricingResult {
  candidatePrice: string | null; netProfit: string | null; safe: boolean;
  violations: string[];
  evidence: { currency: Currency; eligibleOfferIds: string[]; excludedOfferIds: string[]; strategy: PricingStrategyType; calculatedAt: string; profitFloor?: string; changePercent?: string; market?: MarketQuality; mode: 'DRY_RUN' };
}
export interface SellerProduct {
  id: string; parentId?: string; sku: string; name: string; type: 'simple' | 'variable' | 'variation';
  status: string; price: string; regularPrice: string; salePrice: string;
  currency: Currency; inStock: boolean; stockQuantity: number | null;
  modifiedAt: string; attributes: Record<string, string>; images: string[];
}
export interface ConnectionResult {
  ok: boolean; status: 'AWAITING_CREDENTIALS' | 'CONFIGURED_UNVERIFIED' | 'CONNECTED' | 'FAILED' | 'AWAITING_DOCUMENTATION';
  message: string;
}
export interface PriceUpdateRequest { productId: string; parentId?: string; price: string; expectedPrice: string; currency: Currency }
export interface PriceUpdateResult { verified: boolean; previousPrice: string; price: string; product: SellerProduct }
export interface SmsResult { status: 'accepted' | 'failed'; providerId?: string; errorCode?: string }
export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<SmsResult>;
  testConnection(): Promise<ConnectionResult>;
}
