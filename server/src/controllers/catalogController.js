import { catalogService } from '../services/catalogService.js';
import { validatePositiveInteger } from '../utils/validation.js';

export const catalogController = {
  /**
   * GET /api/catalog/search?q=
   */
  async search(req, res, next) {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : 20;

      const results = await catalogService.searchCatalog(q, limit);
      res.json({
        query: q,
        count: results.length,
        results,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/catalog/:productId
   */
  async getDetail(req, res, next) {
    try {
      const productId = validatePositiveInteger(req.params.productId, 'productId');
      const detail = await catalogService.getProductDetail(productId);
      res.json(detail);
    } catch (err) {
      next(err);
    }
  },
};
