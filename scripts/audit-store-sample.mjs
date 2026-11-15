import { readFile, writeFile } from 'node:fs/promises';
import { PublicCatalogReader, compareCatalogSample, parseTorobPreview } from '../packages/core/dist/connectors/catalog-audit.js';

const [storeUrl, previewPath, currency, outputPath] = process.argv.slice(2);
if (!storeUrl || !previewPath || !['IRR', 'IRT'].includes(currency) || !outputPath) {
  throw new Error('Usage: node scripts/audit-store-sample.mjs HTTPS_STORE PREVIEW_JSON IRR|IRT OUTPUT_JSON');
}
const preview = parseTorobPreview(JSON.parse(await readFile(previewPath, 'utf8')), currency);
const rows = await new PublicCatalogReader(storeUrl).readSample(preview.map(p => p.id));
const comparisons = compareCatalogSample(preview, rows);
const report = { checkedAt: new Date().toISOString(), store: new URL(storeUrl).origin, method: 'GET', priceWrites: 0,
  source: 'woocommerce_public_store_api', scope: 'provided_preview_sample_only', competitorCoverage: 'not_tested',
  snapshotCurrency: currency, sampleCount: preview.length, receivedCount: rows.length,
  results: Object.fromEntries(['MATCH', 'VARIANT_REVIEW', 'MISSING', 'DIFFERENCE'].map(status => [status, comparisons.filter(r => r.result === status).length])), comparisons };
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ sampleCount: report.sampleCount, receivedCount: report.receivedCount, results: report.results, priceWrites: 0 }));
