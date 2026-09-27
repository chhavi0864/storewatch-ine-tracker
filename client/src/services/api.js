const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.PROD ? 'https://storewatch-ine-tracker.onrender.com' : 'http://localhost:3001');

async function handleResponse(response) {
  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: `HTTP error ${response.status}: ${response.statusText}` };
    }
    const message = errorData.error || errorData.message || 'An error occurred';
    const err = new Error(message);
    err.status = response.status;
    err.code = errorData.code;
    err.details = errorData.details;
    throw err;
  }
  return response.json();
}

export const api = {
  /**
   * Search live INE catalog
   * GET /api/catalog/search?q=
   */
  async searchCatalog(query) {
    const res = await fetch(`${API_BASE_URL}/api/catalog/search?q=${encodeURIComponent(query)}`);
    return handleResponse(res);
  },

  /**
   * Fetch product detail with options
   * GET /api/catalog/:productId
   */
  async getCatalogDetail(productId) {
    const res = await fetch(`${API_BASE_URL}/api/catalog/${productId}`);
    return handleResponse(res);
  },

  /**
   * List all tracked products with latest price/stock
   * GET /api/tracked-products
   */
  async getTrackedProducts() {
    const res = await fetch(`${API_BASE_URL}/api/tracked-products`, {
      cache: 'no-cache',
    });
    return handleResponse(res);
  },

  /**
   * Add a product variant to tracking
   * POST /api/tracked-products
   */
  async trackProduct(productId, optionId) {
    const res = await fetch(`${API_BASE_URL}/api/tracked-products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId, optionId }),
    });
    return handleResponse(res);
  },

  /**
   * Trigger an on-demand live scrape for a product
   * POST /api/tracked-products/:id/scrape
   */
  async scrapeProduct(trackedProductId) {
    const id = typeof trackedProductId === 'object' && trackedProductId !== null
      ? (trackedProductId.tracked_product_id || trackedProductId.id)
      : trackedProductId;

    const res = await fetch(`${API_BASE_URL}/api/tracked-products/${id}/scrape`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  /**
   * Get full scrape attempt history for a product
   * GET /api/tracked-products/:id/attempts
   */
  async getProductAttempts(trackedProductId) {
    const id = typeof trackedProductId === 'object' && trackedProductId !== null
      ? (trackedProductId.tracked_product_id || trackedProductId.id)
      : trackedProductId;

    const res = await fetch(`${API_BASE_URL}/api/tracked-products/${id}/attempts`, {
      cache: 'no-cache',
    });
    return handleResponse(res);
  },

  /**
   * Get the direct CSV export download URL
   */
  getExportCsvUrl(trackedProductId) {
    const id = typeof trackedProductId === 'object' && trackedProductId !== null
      ? (trackedProductId.tracked_product_id || trackedProductId.id)
      : trackedProductId;

    return `${API_BASE_URL}/api/tracked-products/${id}/export.csv`;
  },
};

