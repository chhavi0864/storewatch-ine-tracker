import { getSupabase } from '../config/supabase.js';
import { ConflictError } from '../utils/errors.js';

export const trackedProductsRepository = {
  /**
   * Retrieves all tracked products with their latest known successful price and stock.
   */
  async findAllWithLatest() {
    const supabase = getSupabase();
    // Use the convenience view created in schema.sql
    const { data, error } = await supabase
      .from('v_latest_product_prices')
      .select('*')
      .order('product_name', { ascending: true });

    if (error) {
      // Fallback to direct table query if view is not accessible
      const { data: directData, error: directError } = await supabase
        .from('tracked_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (directError) throw directError;
      return directData;
    }

    return data;
  },

  /**
   * Retrieves all active tracked products for scheduled scraper runs.
   */
  async findAllActive() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Retrieves a single tracked product by internal UUID.
   */
  async findById(id) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Finds a product by its INE storefront ID and option ID.
   */
  async findByProductAndOption(ineProductId, selectedOptionId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('ine_product_id', ineProductId)
      .eq('selected_option_id', selectedOptionId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Creates a new tracked product.
   */
  async create(productData) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('tracked_products')
      .insert({
        ine_product_id: productData.ine_product_id,
        product_name: productData.product_name,
        product_url: productData.product_url,
        sku: productData.sku || null,
        brand: productData.brand || null,
        category: productData.category || null,
        selected_option_id: productData.selected_option_id,
        selected_option_label: productData.selected_option_label,
        is_active: productData.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      // Postgres error 23505 = unique_violation
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('uq_tracked_product_option')) {
        throw new ConflictError(
          `Product ID ${productData.ine_product_id} with option "${productData.selected_option_label}" is already being tracked`
        );
      }
      throw error;
    }

    return data;
  },

  /**
   * Updates an existing tracked product.
   */
  async update(id, updates) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('tracked_products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
