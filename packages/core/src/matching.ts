export function latinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.includes(digit) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) : '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}
export function normalizePersian(value: string): string {
  return latinDigits(value).normalize('NFKC').toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u200c\u200e\u200f]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function normalizePhone(value: string): string {
  const phone = latinDigits(value).trim().replace(/[\s()-]/g, '').replace(/^0098/, '+98');
  const normalized = phone.startsWith('09') ? `+98${phone.slice(1)}` : phone.startsWith('989') ? `+${phone}` : phone;
  if (!/^\+989\d{9}$/.test(normalized)) throw new Error('INVALID_IRANIAN_MOBILE');
  return normalized;
}
export interface MatchProduct { title: string; sku?: string; gtin?: string; brand?: string; model?: string; attributes?: Record<string, string>; warranty?: string }
export interface MatchSuggestion { confidence: number; status: 'REVIEW_REQUIRED' | 'REJECTED'; reasons: string[]; normalizedTitle: string }
/** A suggestion is never an approval: a matching human decision is persisted separately. */
export function suggestMatch(left: MatchProduct, right: MatchProduct): MatchSuggestion {
  const a = normalizePersian(left.title), b = normalizePersian(right.title);
  const reasons: string[] = [];
  const conflicts: string[] = [];
  const normalize = (value?: string) => value ? normalizePersian(value) : '';
  const includesPhrase = (title: string, terms: string[]) => terms.some(term => ` ${title} `.includes(` ${term} `));
  const accessories = ['قاب', 'کاور', 'گارد', 'گلس', 'محافظ صفحه', 'لوازم جانبی', 'قطعه یدکی', 'بند', 'case', 'cover', 'replacement', 'strap'];
  const used = ['دست دوم', 'کارکرده', 'استوک', 'تعمیری', 'کپی', 'used', 'refurbished', 'replica', 'open box'];
  if (includesPhrase(a, accessories) !== includesPhrase(b, accessories)) conflicts.push('ACCESSORY_MISMATCH');
  if (includesPhrase(a, used) !== includesPhrase(b, used)) conflicts.push('CONDITION_MISMATCH');
  const variants = (title: string) => [['pro', 'پرو'], ['max', 'مکس'], ['plus', 'پلاس'], ['ultra', 'اولترا'], ['mini', 'مینی']].filter(words => includesPhrase(title, words)).map(words => words[0]).sort().join(',');
  if (variants(a) !== variants(b)) conflicts.push('GENERATION_VARIANT_MISMATCH');
  const models = (title: string) => title.split(' ').filter(token => /[a-z]/i.test(token) && /\d/.test(token)).sort().join(',');
  if (models(a) && models(b) && models(a) !== models(b)) conflicts.push('TITLE_MODEL_MISMATCH');
  for (const key of ['brand', 'model', 'warranty'] as const) {
    if (left[key] && right[key] && normalize(left[key]) !== normalize(right[key])) conflicts.push(`${key.toUpperCase()}_MISMATCH`);
  }
  for (const key of new Set([...Object.keys(left.attributes ?? {}), ...Object.keys(right.attributes ?? {})])) {
    const one = left.attributes?.[key], two = right.attributes?.[key];
    if (one && two && normalize(one) !== normalize(two)) conflicts.push(`ATTRIBUTE_MISMATCH:${key}`);
    if (!one || !two) reasons.push(`ATTRIBUTE_MISSING:${key}`);
  }
  if (left.gtin && right.gtin && latinDigits(left.gtin) !== latinDigits(right.gtin)) conflicts.push('GTIN_MISMATCH');
  // Capacity/model numbers in titles are strong constraints, even if attributes are absent.
  const digitsA = [...a.matchAll(/\d+/g)].map(row => row[0]).sort().join(',');
  const digitsB = [...b.matchAll(/\d+/g)].map(row => row[0]).sort().join(',');
  if (digitsA && digitsB && digitsA !== digitsB) conflicts.push('TITLE_NUMERIC_VARIANT_MISMATCH');
  if (conflicts.length) return {confidence: 0, status: 'REJECTED', reasons: conflicts, normalizedTitle: a};
  const tokensA = new Set(a.split(' ').filter(Boolean)), tokensB = new Set(b.split(' ').filter(Boolean));
  const intersection = [...tokensA].filter(token => tokensB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  let score = union ? intersection / union * 0.82 : 0;
  if (a && a === b) { score = 0.84; reasons.push('NORMALIZED_TITLE_MATCH'); }
  if (left.sku && right.sku && normalize(left.sku) === normalize(right.sku)) { score = Math.max(score, 0.96); reasons.push('SKU_MATCH'); }
  if (left.gtin && right.gtin && latinDigits(left.gtin) === latinDigits(right.gtin)) { score = 0.99; reasons.push('GTIN_MATCH'); }
  if (!!left.warranty !== !!right.warranty) {score = Math.min(score, 0.79); reasons.push('WARRANTY_MISSING');}
  if (reasons.some(reason => reason.startsWith('ATTRIBUTE_MISSING'))) score = Math.min(score, 0.79);
  if (!reasons.length) reasons.push('TOKEN_SIMILARITY');
  return {confidence: Math.round(score * 1000) / 1000, status: 'REVIEW_REQUIRED', reasons, normalizedTitle: a};
}
