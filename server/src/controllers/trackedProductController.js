import { trackedProductsRepository } from '../repositories/trackedProductsRepository.js';
import { scrapeAttemptsRepository } from '../repositories/scrapeAttemptsRepository.js';
import { catalogService } from '../services/catalogService.js';
import { scrapeRunner } from '../services/scrapeRunner.js';
import { csvService } from '../services/csvService.js';
import { validatePositiveInteger, validateUUID, validateNonEmptyString } from '../utils/validation.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export const trackedProductController = {
  /**
   * POST /api/tracked-products
   * Body: { productId, optionId }
   */
  async create(req, res, next) {
    try {
      const { productId, optionId } = req.body || {};

      const cleanProductId = validatePositiveInteger(productId, 'productId');
      const cleanOptionId = validateNonEmptyString(optionId, 'optionId');

      // 1. Fetch live product detail to verify option and get canonical metadata
      const detail = await catalogService.getProductDetail(cleanProductId);

      // 2. Verify that optionId actually belongs to that product
      const matchedOption = (detail.options || []).find(opt => opt.id === cleanOptionId);
      if (!matchedOption) {
        const availableOptions = (detail.options || []).map(o => `${o.id} (${o.label})`).join(', ');
        throw new ValidationError(
          `Option ID "${cleanOptionId}" does not exist on product ${cleanProductId}. Available options: ${availableOptions}`
        );
      }

      // 3. Persist product + option pair
      const created = await trackedProductsRepository.create({
        ine_product_id: detail.id,
        product_name: detail.name,
        product_url: detail.productUrl,
        sku: detail.sku,
        brand: detail.brand,
        category: detail.category,
        selected_option_id: matchedOption.id,
        selected_option_label: matchedOption.label,
        is_active: true,
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/tracked-products
   * Returns tracked products with latest known price and stock.
   */
  async list(req, res, next) {
    try {
      const products = await trackedProductsRepository.findAllWithLatest();
      res.json({
        count: products.length,
        products,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/tracked-products/:id/attempts
   * Returns chronological scrape attempt history for a tracked product.
   */
  async getAttempts(req, res, next) {
    try {
      const id = validateUUID(req.params.id, 'id');

      // Verify product exists
      const product = await trackedProductsRepository.findById(id);
      if (!product) {
        throw new NotFoundError(`Tracked product with ID ${id} not found`);
      }

      const attempts = await scrapeAttemptsRepository.findByTrackedProductId(id);
      res.json({
        tracked_product_id: id,
        count: attempts.length,
        attempts,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/tracked-products/:id/scrape
   * Triggers an immediate scrape run for a single tracked product.
   */
  async scrapeSingle(req, res, next) {
    try {
      const id = validateUUID(req.params.id, 'id');

      const product = await trackedProductsRepository.findById(id);
      if (!product) {
        throw new NotFoundError(`Tracked product with ID ${id} not found`);
      }

      const result = await scrapeRunner.runForProduct(product);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/tracked-products/:id/export.csv
   * Downloads a CSV audit file of all scrape attempts.
   */
  async exportCsv(req, res, next) {
    try {
      const id = validateUUID(req.params.id, 'id');

      const product = await trackedProductsRepository.findById(id);
      if (!product) {
        throw new NotFoundError(`Tracked product with ID ${id} not found`);
      }

      const attempts = await scrapeAttemptsRepository.findForExport(id);
      const csvData = csvService.generateAttemptsCsv(attempts);

      const filename = `storewatch-${product.ine_product_id}-${product.selected_option_id}-attempts.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvData);
    } catch (err) {
      next(err);
    }
  },
};
