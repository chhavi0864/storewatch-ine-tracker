/**
 * server/scripts/headed-demo.js
 *
 * Local headed Playwright demonstration script.
 * Scrapes a single product + option pair in headed mode (PLAYWRIGHT_HEADLESS=false)
 * and displays the verified, parsed commercial data.
 *
 * Usage:
 *   node scripts/headed-demo.js [productId] [optionLabel]
 * Examples:
 *   node scripts/headed-demo.js 2456 "Neutral white"
 *   node scripts/headed-demo.js 2954 "2-pack"
 *   node scripts/headed-demo.js 2645 "Standard kit"
 */

import { scrapeQuote } from '../src/services/quoteScraper.js';
import { catalogService } from '../src/services/catalogService.js';

async function runDemo() {
  const args = process.argv.slice(2);
  const targetProductId = args[0] ? parseInt(args[0], 10) : 2456;
  let targetOptionLabel = args[1] || null;

  console.log('='.repeat(65));
  console.log(' StoreWatch v2 — Headed Playwright Scraper Demo');
  console.log('='.repeat(65));
  console.log(`[Demo] Fetching product metadata for ID: ${targetProductId}...`);

  const detail = await catalogService.getProductDetail(targetProductId);
  console.log(`[Demo] Product: "${detail.name}" (${detail.brand})`);
  console.log(`[Demo] Category: ${detail.category} | SKU: ${detail.sku}`);
  console.log(`[Demo] Variant Axis: ${detail.optionAxis}`);
  console.log(`[Demo] Options available:`, detail.options.map(o => `${o.id}: "${o.label}"`).join(', '));

  // Determine option to scrape
  let chosenOption = null;
  if (targetOptionLabel) {
    chosenOption = detail.options.find(o => o.label.toLowerCase() === targetOptionLabel.toLowerCase());
  }
  if (!chosenOption) {
    // Default to second option if multi-option, otherwise first
    chosenOption = detail.options[1] || detail.options[0];
  }

  console.log(`[Demo] Selected Option for scrape: "${chosenOption.label}" (ID: ${chosenOption.id})`);
  console.log(`[Demo] Launching headed Playwright browser session...`);
  console.log('-'.repeat(65));

  const t0 = Date.now();
  try {
    const quote = await scrapeQuote({
      productId: detail.id,
      optionId: chosenOption.id,
      optionLabel: chosenOption.label,
      headless: false, // Headed as required
      timeoutMs: 25000,
    });

    const elapsed = Date.now() - t0;

    console.log('\n' + '='.repeat(65));
    console.log(' SCRAPE COMPLETED SUCCESSFULLY');
    console.log('='.repeat(65));
    console.log(`Product ID:         ${detail.id}`);
    console.log(`Product Name:       ${detail.name}`);
    console.log(`Selected Option:    ${chosenOption.label} (${chosenOption.id})`);
    console.log(`Current Price:      ${quote.currency} ${quote.current_price.toLocaleString('en-IN')}`);
    console.log(`Raw Stock Text:     ${quote.stock_text}`);
    console.log(`Parsed In-Stock:    ${quote.parsed_in_stock ? 'YES (In Stock)' : 'NO (Sold Out)'}`);
    console.log(`Parsed Stock Units: ${quote.parsed_stock_count !== null ? quote.parsed_stock_count : 'Unspecified'}`);
    console.log(`Duration:           ${quote.duration_ms} ms (Total elapsed: ${elapsed} ms)`);
    console.log('='.repeat(65));

  } catch (err) {
    console.error('\n' + '!'.repeat(65));
    console.error(' SCRAPE ATTEMPT FAILED');
    console.error('!'.repeat(65));
    console.error(`Error Code: ${err.code || 'UNKNOWN'}`);
    console.error(`Message:    ${err.message}`);
    if (err.details) {
      console.error(`Details:   `, JSON.stringify(err.details));
    }
    console.error('!'.repeat(65));
    process.exit(1);
  }
}

runDemo();
