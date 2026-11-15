import { Decimal } from 'decimal.js';
import type { Currency } from './types.js';

export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export function decimal(value: string, name = 'amount'): Decimal {
  if (typeof value !== 'string' || !/^-?\d{1,24}(\.\d{1,8})?$/.test(value)) throw new Error(`INVALID_${name.toUpperCase()}`);
  const result = new Money(value);
  if (!result.isFinite()) throw new Error(`INVALID_${name.toUpperCase()}`);
  return result;
}
export function nonNegative(value: string, name = 'amount'): Decimal {
  const result = decimal(value, name);
  if (result.isNegative()) throw new Error(`INVALID_${name.toUpperCase()}`);
  return result;
}
export function convertCurrency(amount: string, from: Currency, to: Currency): string {
  if (!['IRR', 'IRT'].includes(from) || !['IRR', 'IRT'].includes(to)) throw new Error('UNSUPPORTED_CURRENCY');
  const value = decimal(amount);
  return (from === to ? value : from === 'IRT' ? value.mul(10) : value.div(10)).toFixed();
}
export function formatMoney(amount: string, currency: Currency, locale = 'fa-IR'): string {
  const value = decimal(amount);
  // Keep integer strings out of Number to avoid losing precision for large balances.
  const whole = BigInt(value.toDecimalPlaces(0).toFixed(0));
  return `${new Intl.NumberFormat(locale).format(whole)} ${currency === 'IRT' ? 'تومان' : 'ریال'}`;
}
