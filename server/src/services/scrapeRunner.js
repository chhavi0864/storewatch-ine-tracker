import { scrapeQuote } from './quoteScraper.js';
import { scrapeAttemptsRepository } from '../repositories/scrapeAttemptsRepository.js';
import { trackedProductsRepository } from '../repositories/trackedProductsRepository.js';
import { calculateBackoff, sleep } from '../utils/retry.js';

export const scrapeRunner = {
  /**
   * Executes a reliable scrape run for a single tracked product with up to 3 attempts.
   * Records immutable history in scrape_attempts table.
   *
   * @param {Object} trackedProduct - tracked_products row
   * @param {Object} [options]
   * @param {boolean} [options.headless] - Playwright headless override
   * @returns {Promise<Object>} Final scrape outcome summary
   */
  async runForProduct(trackedProduct, options = {}) {
    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();

      try {
        const quote = await scrapeQuote({
          productId: trackedProduct.ine_product_id,
          optionId: trackedProduct.selected_option_id,
          optionLabel: trackedProduct.selected_option_label,
          headless: options.headless,
          timeoutMs: options.timeoutMs,
        });

        // Record successful attempt in database
        const recorded = await scrapeAttemptsRepository.recordAttempt({
          tracked_product_id: trackedProduct.id,
          scraped_at: new Date().toISOString(),
          attempt_number: attempt,
          outcome: 'success',
          current_price: quote.current_price,
          currency: quote.currency,
          stock_text: quote.stock_text,
          parsed_stock_count: quote.parsed_stock_count,
          parsed_in_stock: quote.parsed_in_stock,
          duration_ms: quote.duration_ms,
        });

        return {
          success: true,
          outcome: 'success',
          attempt_number: attempt,
          data: quote,
          record: recorded,
        };

      } catch (err) {
        lastError = err;
        const duration_ms = err.details?.duration_ms || (Date.now() - t0);
        const isLastAttempt = attempt === maxAttempts;
        const outcome = isLastAttempt ? 'failed' : 'retried';

        // Record attempt (with strictly null price/stock fields)
        await scrapeAttemptsRepository.recordAttempt({
          tracked_product_id: trackedProduct.id,
          scraped_at: new Date().toISOString(),
          attempt_number: attempt,
          outcome,
          current_price: null,
          currency: null,
          stock_text: null,
          parsed_stock_count: null,
          parsed_in_stock: null,
          error_code: err.code || 'SCRAPE_ERROR',
          error_message: err.message || 'Scrape attempt failed',
          duration_ms,
        }).catch(dbErr => {
          console.error(`[ScrapeRunner] Failed to persist ${outcome} row for product ${trackedProduct.id}:`, dbErr.message);
        });

        // If not last attempt, wait with exponential backoff before retrying
        if (!isLastAttempt) {
          const backoffMs = calculateBackoff(attempt);
          await sleep(backoffMs);
        }
      }
    }

    return {
      success: false,
      outcome: 'failed',
      attempt_number: maxAttempts,
      error: lastError?.message || 'All 3 scrape attempts failed',
      code: lastError?.code || 'MAX_ATTEMPTS_EXCEEDED',
    };
  },

  /**
   * Scrapes all active tracked products in sequence (scheduled cron job).
   */
  async runAllActive(options = {}) {
    const activeProducts = await trackedProductsRepository.findAllActive();
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const product of activeProducts) {
      try {
        const result = await this.runForProduct(product, options);
        results.push({
          productId: product.ine_product_id,
          productName: product.product_name,
          option: product.selected_option_label,
          outcome: result.outcome,
          attempt: result.attempt_number,
          price: result.data?.current_price || null,
        });

        if (result.success) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
        results.push({
          productId: product.ine_product_id,
          productName: product.product_name,
          outcome: 'failed',
          error: err.message,
        });
      }
    }

    return {
      total: activeProducts.length,
      success: successCount,
      failed: failedCount,
      results,
    };
  },
};
