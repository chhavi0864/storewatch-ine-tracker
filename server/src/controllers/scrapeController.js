import crypto from 'crypto';
import { env } from '../config/env.js';
import { scrapeRunner } from '../services/scrapeRunner.js';
import { AppError } from '../utils/errors.js';

/**
 * Safely compares two strings in constant time to prevent timing attacks.
 */
function safeCompareSecret(provided, expected) {
  if (!provided || !expected) return false;
  const bufProvided = Buffer.from(String(provided));
  const bufExpected = Buffer.from(String(expected));

  if (bufProvided.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

// In-process lock to prevent overlapping scheduled scrape runs
let isScrapeAllRunning = false;

export const scrapeController = {
  /**
   * POST /internal/scrape-all
   * Protected cron endpoint for recurring multi-product scrapes.
   * Acknowledges asynchronously with HTTP 202 to accommodate external scheduler timeouts (e.g. cron-job.org 30s limit).
   */
  async scrapeAll(req, res, next) {
    try {
      const providedSecret = req.headers['x-cron-secret'];

      if (!env.CRON_SECRET) {
        throw new AppError('Server cron secret is not configured in CRON_SECRET environment variable', 500, 'CRON_NOT_CONFIGURED');
      }

      if (!providedSecret || !safeCompareSecret(providedSecret, env.CRON_SECRET)) {
        return res.status(401).json({
          error: 'Unauthorized: missing or invalid x-cron-secret header',
          code: 'UNAUTHORIZED',
        });
      }

      // Check if a bulk scrape is already in progress
      if (isScrapeAllRunning) {
        return res.status(202).json({
          ok: true,
          accepted: false,
          message: 'A scheduled scrape is already running',
        });
      }

      isScrapeAllRunning = true;
      const startedAt = new Date().toISOString();

      // Launch background scrape workflow asynchronously
      (async () => {
        try {
          console.log(`[ScheduledScrape] Started background scrape-all run at ${startedAt}`);
          const summary = await scrapeRunner.runAllActive();
          console.log(`[ScheduledScrape] Finished run: ${summary.success}/${summary.total} succeeded, ${summary.failed} failed at ${new Date().toISOString()}`);
        } catch (err) {
          console.error('[ScheduledScrape] Background bulk scrape error:', err.message || err);
        } finally {
          isScrapeAllRunning = false;
        }
      })();

      // Immediately return HTTP 202 Accepted to prevent cron timeouts
      return res.status(202).json({
        ok: true,
        accepted: true,
        message: 'Scheduled scrape started',
        startedAt,
      });
    } catch (err) {
      next(err);
    }
  },
};
