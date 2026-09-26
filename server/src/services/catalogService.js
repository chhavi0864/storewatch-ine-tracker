import { env } from '../config/env.js';
import { NotFoundError, AppError } from '../utils/errors.js';

export const catalogService = {
  /**
   * Searches the live INE catalogue API case-insensitively by name, brand, category, or SKU.
   * Returns a compact list without persisting in database.
   */
  async searchCatalog(query = '', limit = 20) {
    const q = query.trim().toLowerCase();

    // Fetch listings from INE public API
    // We request up to 100 items from page 1 to provide instant rich search results
    const url = `${env.INE_BASE_URL}/api/v2/listings?page=1&limit=100`;
    
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      throw new AppError(`Failed to reach INE catalogue service: ${err.message}`, 502, 'CATALOG_UPSTREAM_ERROR');
    }

    if (!response.ok) {
      throw new AppError(`INE catalogue returned HTTP ${response.status}`, 502, 'CATALOG_UPSTREAM_ERROR');
    }

    const data = await response.json();
    const items = data.results || [];

    // Filter matching products
    const filtered = q
      ? items.filter(item => {
          const nameMatch = item.name?.toLowerCase().includes(q);
          const brandMatch = item.brand?.toLowerCase().includes(q);
          const catMatch = item.category?.toLowerCase().includes(q);
          const skuMatch = item.sku?.toLowerCase().includes(q);
          return nameMatch || brandMatch || catMatch || skuMatch;
        })
      : items;

    // Return compact result list
    return filtered.slice(0, limit).map(item => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      category: item.category,
      sku: item.sku,
      description: item.description,
    }));
  },

  /**
   * Fetches product metadata, optionAxis, and options from public INE product-detail API.
   * Does NOT include price/stock figures (which require Playwright scraping).
   */
  async getProductDetail(productId) {
    const url = `${env.INE_BASE_URL}/api/v2/items/${productId}`;

    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      throw new AppError(`Failed to reach INE product service: ${err.message}`, 502, 'CATALOG_UPSTREAM_ERROR');
    }

    if (response.status === 404) {
      throw new NotFoundError(`Product ID ${productId} not found in INE catalogue`);
    }

    if (!response.ok) {
      throw new AppError(`INE product detail returned HTTP ${response.status}`, 502, 'CATALOG_UPSTREAM_ERROR');
    }

    const detail = await response.json();

    return {
      id: detail.id,
      slug: detail.slug,
      name: detail.name,
      brand: detail.brand,
      category: detail.category,
      sku: detail.sku,
      description: detail.description,
      specs: detail.specs || null,
      optionAxis: detail.optionAxis || 'Option',
      options: (detail.options || []).map(opt => ({
        id: opt.id,
        label: opt.label,
      })),
      productUrl: `${env.INE_BASE_URL}/item/${detail.id}`,
    };
  },
};
