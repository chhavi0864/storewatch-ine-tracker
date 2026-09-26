/**
 * Escapes a field for RFC 4180 CSV compliance.
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const csvService = {
  /**
   * Generates CSV text for scrape attempts of a tracked product.
   *
   * Columns:
   *  - product ID from URL
   *  - product name
   *  - selected option
   *  - UTC ISO timestamp
   *  - price (blank for retried/failed)
   *  - stock (blank for retried/failed)
   *  - outcome
   */
  generateAttemptsCsv(attempts) {
    const headers = [
      'product_id',
      'product_name',
      'selected_option',
      'scraped_at',
      'price',
      'stock',
      'outcome',
    ];

    const rows = [headers.join(',')];

    for (const row of attempts) {
      const isSuccess = row.outcome === 'success';

      const ineProductId = row.tracked_products?.ine_product_id ?? '';
      const productName = row.tracked_products?.product_name ?? '';
      const optionLabel = row.tracked_products?.selected_option_label ?? '';
      const timestamp = row.scraped_at ? new Date(row.scraped_at).toISOString() : '';
      const price = isSuccess && row.current_price !== null ? Number(row.current_price).toFixed(2) : '';
      const stock = isSuccess && row.stock_text ? row.stock_text : '';
      const outcome = row.outcome;

      const line = [
        escapeCsv(ineProductId),
        escapeCsv(productName),
        escapeCsv(optionLabel),
        escapeCsv(timestamp),
        escapeCsv(price),
        escapeCsv(stock),
        escapeCsv(outcome),
      ].join(',');

      rows.push(line);
    }

    return rows.join('\r\n');
  },
};
