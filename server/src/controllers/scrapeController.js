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

export const scrapeController = {
  /**
   * POST /internal/scrape-all
   * Protected cron endpoint for recurring multi-product scrapes.
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

      // Execute sequential scrape for all active products
      const summary = await scrapeRunner.runAllActive();

      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
};
