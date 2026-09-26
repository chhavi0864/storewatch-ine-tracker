import { chromium } from 'playwright';
import { env } from '../config/env.js';
import { parsePrice, parseStock, validateSuccessQuote } from '../utils/validation.js';
import { ScraperError } from '../utils/errors.js';

/**
 * Dismisses the cookie consent modal if present.
 * Uses a retry loop to overcome stochastic multi-click resistance.
 */
async function dismissCookieConsentIfPresent(page) {
  const scrim = page.locator('.consent-scrim');
  const allowBtn = page.locator('.consent-scrim button[aria-label="Allow cookies"], .consent-scrim button:has-text("Allow")');

  for (let i = 0; i < 4; i++) {
    const isVis = await scrim.isVisible().catch(() => false);
    if (!isVis) break;

    const btnVis = await allowBtn.first().isVisible().catch(() => false);
    if (btnVis) {
      await allowBtn.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
    } else {
      break;
    }
  }
}

/**
 * Scrapes the live price and stock for a given product and option.
 * Interacts only via visible browser DOM actions.
 *
 * @param {Object} params
 * @param {number|string} params.productId - INE product ID (e.g. 2456)
 * @param {string} params.optionId - Option ID (e.g. 'o1', 'o2')
 * @param {string} params.optionLabel - Option label (e.g. 'Neutral white', '2-pack')
 * @param {boolean} [params.headless] - Headless mode override
 * @param {number} [params.timeoutMs] - Scraper timeout override
 * @returns {Promise<Object>} Validated price and stock data
 */
export async function scrapeQuote({
  productId,
  optionId,
  optionLabel,
  headless = env.PLAYWRIGHT_HEADLESS,
  timeoutMs = env.SCRAPER_TIMEOUT_MS,
}) {
  const t0 = Date.now();
  let browser = null;

  try {
    browser = await chromium.launch({
      headless,
      slowMo: headless ? 0 : 40,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    const productUrl = `${env.INE_BASE_URL}/item/${productId}`;

    // 1. Open product page
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: timeoutMs });

    // 2. Dismiss cookie consent if present
    await page.waitForTimeout(800);
    await dismissCookieConsentIfPresent(page);

    // 3. Select the saved option and confirm it becomes active
    if (optionLabel) {
      const optionBtn = page.locator('button.opt-chip', { hasText: optionLabel });
      if (await optionBtn.count() > 0) {
        await dismissCookieConsentIfPresent(page);
        const isPressed = await optionBtn.first().getAttribute('aria-pressed').catch(() => null);
        if (isPressed !== 'true') {
          await optionBtn.first().scrollIntoViewIfNeeded().catch(() => {});
          await optionBtn.first().click({ force: true }).catch(() => optionBtn.first().click());
          // Confirm aria-pressed flips to true
          await page.waitForFunction(
            el => el && el.getAttribute('aria-pressed') === 'true',
            await optionBtn.first().elementHandle(),
            { timeout: 5000 }
          ).catch(() => {});
        }
      }
    }

    // 4. Locate the visible locked quote panel
    const offerPanel = page.locator('.offer-panel');
    await offerPanel.first().waitFor({ state: 'visible', timeout: 5000 });
    const panelBox = await offerPanel.first().boundingBox();

    if (!panelBox) {
      throw new ScraperError('Offer panel bounding box could not be determined', 'PANEL_BOUNDS_ERROR');
    }

    // 5. Move the mouse inside the panel at least 8 times, about 55ms apart
    // Retry sweep if a consent modal pops up mid-sweep
    const checkBtn = page.locator('button.ctl.ctl-main[aria-label*="price"], button.ctl.ctl-main:has-text("Check today")');

    let unlocked = false;
    for (let sweepAttempt = 1; sweepAttempt <= 3; sweepAttempt++) {
      await dismissCookieConsentIfPresent(page);

      const y = panelBox.y + panelBox.height / 2;
      const x0 = panelBox.x + 30;
      const x1 = panelBox.x + panelBox.width - 30;

      await page.mouse.move(x0, y);
      const sweepT0 = Date.now();

      const steps = 14; // > 8 moves
      for (let i = 1; i <= steps; i++) {
        if (await page.locator('.consent-scrim').isVisible().catch(() => false)) {
          await dismissCookieConsentIfPresent(page);
          break; // restart sweep
        }
        const curX = x0 + (x1 - x0) * (i / steps);
        await page.mouse.move(curX, y);
        await page.waitForTimeout(55);
      }

      // 6. Wait roughly 700ms after movement to meet min dwell requirement
      const remainingDwell = Math.max(0, 700 - (Date.now() - sweepT0));
      if (remainingDwell > 0) {
        await page.waitForTimeout(remainingDwell);
      }

      // 7. Check if the price button is enabled
      const disabledAttr = await checkBtn.first().getAttribute('disabled').catch(() => 'err');
      if (disabledAttr === null) {
        unlocked = true;
        break;
      }
    }

    if (!unlocked) {
      // Final poll for button enabled state
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button.ctl.ctl-main[aria-label*="price"]') ||
                      document.querySelector('button.ctl.ctl-main');
          return btn && !btn.hasAttribute('disabled');
        },
        null,
        { timeout: 4000 }
      ).catch(() => {});
    }

    // 8. Click the "Check today’s price" button
    await dismissCookieConsentIfPresent(page);
    await checkBtn.first().click();

    // 9. Wait for revealed visible price and stock fields (offer-ready)
    await page.waitForSelector('.offer-panel.offer-ready, .ctl.ctl-plain.ctl-xs', {
      state: 'visible',
      timeout: timeoutMs,
    });

    // 10 & 11. Extract ONLY visible revealed price and stock; NEVER read hidden/decoy elements
    const rawData = await page.evaluate(() => {
      const panel = document.querySelector('.offer-panel.offer-ready') || document.querySelector('.offer-panel');
      if (!panel) return null;

      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        // Exclude decoy classes and attributes
        if (el.classList.contains('price-value') || el.classList.contains('amount')) return false;
        if (el.hasAttribute('data-price')) return false;
        return true;
      };

      const offerRow = panel.querySelector('.offer-row');
      let rawPriceText = null;

      if (offerRow) {
        // The storefront renders the actual live unlocked quote inside the <strong> element in .offer-row
        // (It wraps individual characters in spans with zero-width spaces; taking leaf spans extracted single digits)
        const strongEl = offerRow.querySelector('strong');
        if (strongEl && isVisible(strongEl)) {
          rawPriceText = strongEl.textContent.trim();
        } else {
          const textNodes = Array.from(offerRow.querySelectorAll('*')).filter(el => {
            return isVisible(el) && el.children.length === 0 && el.textContent.trim().length > 0;
          });

          for (const el of textNodes) {
            const text = el.textContent.trim();
            const style = window.getComputedStyle(el);
            const isStrikethrough = style.textDecorationLine.includes('line-through') || style.textDecoration.includes('line-through');

            if (isStrikethrough) continue;
            if (text.includes('% saving') || text.includes('Member price') || text.includes('Refreshing')) continue;

            // Found price text
            if (/[0-9]/.test(text) && (text.includes('₹') || text.includes('Rs') || text.includes('$') || text.includes('€') || /^[0-9,.]+$/.test(text))) {
              rawPriceText = text;
              break;
            }
          }
        }
      }

      // Extract stock text
      let rawStockText = null;
      const stockPill = panel.querySelector('.avail-pill');
      if (stockPill && isVisible(stockPill)) {
        rawStockText = stockPill.textContent.trim();
      } else {
        const facts = Array.from(panel.querySelectorAll('.offer-facts *')).filter(isVisible);
        for (const el of facts) {
          const t = el.textContent.trim();
          if (/stock|available|sold\s*out|last\s*few|ready\s*to\s*ship/i.test(t)) {
            rawStockText = t;
            break;
          }
        }
      }

      return { rawPriceText, rawStockText };
    });

    if (!rawData || !rawData.rawPriceText) {
      throw new ScraperError('Revealed price element was not found or was empty in visible DOM', 'PRICE_NOT_FOUND');
    }

    if (!rawData.rawStockText) {
      throw new ScraperError('Revealed stock element was not found in visible DOM', 'STOCK_NOT_FOUND');
    }

    // 12. Parse price and stock deterministically
    const parsedPrice = parsePrice(rawData.rawPriceText);
    const parsedStock = parseStock(rawData.rawStockText);

    const result = {
      current_price: parsedPrice.current_price,
      currency: parsedPrice.currency,
      stock_text: parsedStock.stock_text,
      parsed_stock_count: parsedStock.parsed_stock_count,
      parsed_in_stock: parsedStock.parsed_in_stock,
      duration_ms: Date.now() - t0,
    };

    // 13. Validate mandatory success values
    validateSuccessQuote(result);

    return result;

  } catch (err) {
    const duration_ms = Date.now() - t0;
    const errorCode = err.code || (err.name === 'TimeoutError' ? 'TIMEOUT' : 'SCRAPER_FAILURE');
    const safeMessage = err.message ? err.message.slice(0, 300) : 'Unknown scraper error';

    throw new ScraperError(safeMessage, errorCode, { duration_ms });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
