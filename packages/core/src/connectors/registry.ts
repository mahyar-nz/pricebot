import type { ConnectionResult, MarketOffer, PriceUpdateRequest, PriceUpdateResult, SellerProduct } from '../types.js';

export type CapabilityState = 'SUPPORTED' | 'UNSUPPORTED' | 'AWAITING_CREDENTIALS' | 'AWAITING_DOCUMENTATION' | 'AWAITING_PERMISSION' | 'DEVELOPMENT' | 'VERIFIED_SANDBOX' | 'VERIFIED_PRODUCTION' | 'UNAVAILABLE';
export interface ConnectorCapability {id: string; name: string; marketData: CapabilityState; sellerOperations: CapabilityState; automaticEnabled: boolean; documentation?: string; blockers: string[]}
export const CONNECTOR_REGISTRY: readonly ConnectorCapability[] = [
  {id: 'torob', name: 'ترب', marketData: 'AWAITING_PERMISSION', sellerOperations: 'AWAITING_CREDENTIALS', automaticEnabled: false, documentation: 'https://github.com/torob/Torob-Sync/blob/main/shop_api.md', blockers: ['خواندن محصولات خود فروشگاه پیاده‌سازی شده؛ توکن رسمی و آزمون زنده لازم است.', 'Shop API منبع قیمت رقبا نیست؛ پایش رقبا به منبع مجاز مستقل نیاز دارد.']},
  {id: 'emalls', name: 'ایمالز', marketData: 'AWAITING_PERMISSION', sellerOperations: 'AWAITING_DOCUMENTATION', automaticEnabled: false, blockers: ['دسترسی مجاز و مستندات API موردنیاز است.']},
  {id: 'basalam', name: 'باسلام', marketData: 'AWAITING_PERMISSION', sellerOperations: 'AWAITING_CREDENTIALS', automaticEnabled: false, documentation: 'https://github.com/basalam/openapi-docs', blockers: ['ثبت کلاینت OAuth، تعیین scope و تأیید دسترسی عملیات قیمت لازم است.']},
  {id: 'snappshop', name: 'اسنپ‌شاپ', marketData: 'AWAITING_DOCUMENTATION', sellerOperations: 'AWAITING_DOCUMENTATION', automaticEnabled: false, blockers: ['مستندات رسمی و مجوز حساب فروشنده ارائه نشده است.']},
  {id: 'tapsishop', name: 'تپسی‌شاپ', marketData: 'AWAITING_DOCUMENTATION', sellerOperations: 'AWAITING_DOCUMENTATION', automaticEnabled: false, blockers: ['مستندات رسمی و مجوز حساب فروشنده ارائه نشده است.']},
  {id: 'digikala', name: 'دیجی‌کالا', marketData: 'AWAITING_PERMISSION', sellerOperations: 'AWAITING_DOCUMENTATION', automaticEnabled: false, blockers: ['مستندات و دسترسی مجاز حساب فروشنده موردنیاز است.']},
  {id: 'woocommerce', name: 'ووکامرس', marketData: 'UNSUPPORTED', sellerOperations: 'AWAITING_CREDENTIALS', automaticEnabled: false, documentation: 'https://woocommerce.github.io/woocommerce-rest-api-docs/', blockers: ['پیاده‌سازی API آماده آزمون است؛ هیچ فروشگاه واقعی متصل یا تأیید نشده است.']},
];
export interface MarketDataConnector {
  validateConfiguration(): Promise<ConnectionResult>;
  getOffers(productId: string): Promise<MarketOffer[]>;
  getCapabilities(): ConnectorCapability;
}
export interface SellerConnector {
  testConnection(): Promise<ConnectionResult>;
  syncProducts(options?: {modifiedAfter?: string}): Promise<SellerProduct[]>;
  getProduct(id: string, parentId?: string): Promise<SellerProduct>;
  updatePrice(request: PriceUpdateRequest): Promise<PriceUpdateResult>;
}
export class UnavailableMarketConnector implements MarketDataConnector {
  constructor(readonly id: string) {
    if (!CONNECTOR_REGISTRY.some(c => c.id === id)) throw new Error('UNKNOWN_CONNECTOR');
  }
  getCapabilities(): ConnectorCapability { return {...CONNECTOR_REGISTRY.find(c => c.id === this.id)!}; }
  async validateConfiguration(): Promise<ConnectionResult> {return {ok: false, status: 'AWAITING_DOCUMENTATION', message: this.getCapabilities().blockers.join(' ')};}
  async getOffers(_productId: string): Promise<MarketOffer[]> {throw new Error('MARKET_ACCESS_NOT_CONFIGURED');}
}
