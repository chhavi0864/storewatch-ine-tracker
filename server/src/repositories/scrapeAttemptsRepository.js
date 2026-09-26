import { getSupabase } from '../config/supabase.js';

export const scrapeAttemptsRepository = {
  /**
   * Inserts an immutable scrape attempt record.
   * Enforces that price/stock fields are strictly null for non-success outcomes.
   */
  async recordAttempt(attempt) {
    const supabase = getSupabase();

    const isSuccess = attempt.outcome === 'success';

    const payload = {
      tracked_product_id: attempt.tracked_product_id,
      scraped_at: attempt.scraped_at || new Date().toISOString(),
      attempt_number: attempt.attempt_number || 1,
      outcome: attempt.outcome,
      current_price: isSuccess ? attempt.current_price : null,
      currency: isSuccess ? attempt.currency : null,
      stock_text: isSuccess ? attempt.stock_text : null,
      parsed_stock_count: isSuccess ? attempt.parsed_stock_count : null,
      parsed_in_stock: isSuccess ? attempt.parsed_in_stock : null,
      error_code: isSuccess ? null : (attempt.error_code || null),
      error_message: isSuccess ? null : (attempt.error_message || null),
      duration_ms: Math.max(0, Math.round(attempt.duration_ms || 0)),
      page_fingerprint: attempt.page_fingerprint || null,
    };

    const { data, error } = await supabase
      .from('scrape_attempts')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Retrieves full chronological attempt history for a tracked product.
   */
  async findByTrackedProductId(trackedProductId, limit = 100) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('scrape_attempts')
      .select('*')
      .eq('tracked_product_id', trackedProductId)
      .order('scraped_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * Retrieves all attempts joined with product metadata for CSV export.
   */
  async findForExport(trackedProductId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('scrape_attempts')
      .select(`
        id,
        scraped_at,
        attempt_number,
        outcome,
        current_price,
        currency,
        stock_text,
        parsed_stock_count,
        parsed_in_stock,
        duration_ms,
        error_code,
        error_message,
        tracked_products (
          ine_product_id,
          product_name,
          sku,
          brand,
          category,
          selected_option_id,
          selected_option_label
        )
      `)
      .eq('tracked_product_id', trackedProductId)
      .order('scraped_at', { ascending: false });

    if (error) throw error;
    return data;
  },
};
