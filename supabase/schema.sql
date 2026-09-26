-- ==============================================================================
-- StoreWatch v2 — Supabase PostgreSQL Schema
-- ==============================================================================
-- Design philosophy:
-- 1. Intentionally simple, explainable two-table model.
-- 2. tracked_products: Defines WHAT we watch (one row per product + chosen option).
-- 3. scrape_attempts: Immutable append-only log of HOW EACH SCRAPE WENT.
--    Powers price/stock history, scraper observability, and CSV audit export.
-- 4. Strict DB-level integrity constraints guaranteeing verified data on 'success'
--    and enforcing NULL price/stock on 'retried' or 'failed' attempts.
-- 5. Excludes all ephemeral/decoy attributes (fake prices, MRP, savings %, seller,
--    delivery text, star ratings) to keep core tracking accurate and lean.
-- ==============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- Table A: tracked_products
-- ------------------------------------------------------------------------------
-- Represents a single monitored product variant. In the INE storefront, pricing
-- and availability are variant-specific (keyed by optionId, e.g., 'o1', 'o2').
-- Therefore, tracking is defined by (ine_product_id, selected_option_id).
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tracked_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- INE storefront identifiers
  ine_product_id        INTEGER NOT NULL,
  product_name          TEXT NOT NULL,
  product_url           TEXT NOT NULL,
  
  -- Product-level metadata (from catalogue/item API)
  sku                   TEXT,
  brand                 TEXT,
  category              TEXT,
  
  -- Variant selection (the single option axis chosen for monitoring)
  selected_option_id    TEXT NOT NULL,     -- e.g. 'o1', 'o2', 'o3'
  selected_option_label TEXT NOT NULL,     -- e.g. 'Neutral white', '2-pack'
  
  -- Operational controls
  is_active             BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps (stored in UTC)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Ensure we don't duplicate identical product + option pairs
  CONSTRAINT uq_tracked_product_option UNIQUE (ine_product_id, selected_option_id)
);

COMMENT ON TABLE tracked_products IS 
  'Target list of products and specific options monitored by StoreWatch.';
COMMENT ON COLUMN tracked_products.ine_product_id IS 
  'The numeric product ID from the storefront URL (/item/:id).';
COMMENT ON COLUMN tracked_products.selected_option_id IS 
  'The specific variant ID (e.g. o1, o2) passed to the quote API.';
COMMENT ON COLUMN tracked_products.selected_option_label IS 
  'Human-readable label of the option chip (e.g. Starter, 2-pack).';
COMMENT ON COLUMN tracked_products.is_active IS 
  'Toggle to pause or resume automated polling for this product variant.';

-- ------------------------------------------------------------------------------
-- Table B: scrape_attempts
-- ------------------------------------------------------------------------------
-- One immutable row per actual scrape attempt.
-- Serves three distinct functional requirements:
--   1. Price & Stock History View: Filter by outcome = ''success'' ordered by time.
--   2. Per-Product Scrape Log: Inspect consecutive attempts, retries, and errors.
--   3. CSV Export: Complete chronological audit trail of all automated runs.
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scrape_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign key linking to the monitored product
  tracked_product_id    UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  
  -- UTC timestamp of the attempt
  scraped_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  
  -- Attempt index within a multi-attempt scrape run (e.g., attempt 1, attempt 2)
  attempt_number        INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  
  -- Outcome lifecycle constraint
  outcome               TEXT NOT NULL CHECK (outcome IN ('success', 'retried', 'failed')),
  
  -- Verified Commercial Data (strictly nullable; must be populated ONLY on success)
  current_price         NUMERIC(12, 2),
  currency              TEXT,              -- Standardized ISO code or symbol (e.g. 'INR' or '₹')
  stock_text            TEXT,              -- Raw verified stock string (e.g. 'Stock: 73 remaining', 'Sold out')
  parsed_stock_count    INTEGER,           -- Parsed numeric quantity if available (e.g. 73, 0 for sold out)
  parsed_in_stock       BOOLEAN,           -- Explicit stock boolean flag
  
  -- Error telemetry (strictly populated on retried/failed; NULL on success)
  error_code            TEXT,              -- Machine-readable error code (e.g. 'RATE_LIMITED_429', 'TIMEOUT', 'CHALLENGE_FAILED')
  error_message         TEXT,              -- Diagnostic error message
  
  -- Scraper Performance & Fingerprint
  duration_ms           INTEGER NOT NULL CHECK (duration_ms >= 0),
  page_fingerprint      TEXT,              -- Optional manifest revision or DOM variant identifier
  
  -- ----------------------------------------------------------------------------
  -- Data Integrity Constraints
  -- ----------------------------------------------------------------------------
  -- Rule 1: A 'success' row MUST have verified price, currency, stock_text,
  --         and parsed_in_stock populated, with no error recorded.
  -- Rule 2: A 'retried' or 'failed' row MUST NOT record any price or stock values.
  -- ----------------------------------------------------------------------------
  CONSTRAINT chk_scrape_outcome_integrity CHECK (
    (
      outcome = 'success'
      AND current_price IS NOT NULL
      AND currency IS NOT NULL
      AND stock_text IS NOT NULL
      AND parsed_in_stock IS NOT NULL
      AND error_code IS NULL
      AND error_message IS NULL
    )
    OR
    (
      outcome IN ('retried', 'failed')
      AND current_price IS NULL
      AND currency IS NULL
      AND stock_text IS NULL
      AND parsed_stock_count IS NULL
      AND parsed_in_stock IS NULL
    )
  )
);

COMMENT ON TABLE scrape_attempts IS 
  'Append-only log of every individual scrape attempt. Powers history, health, and export.';
COMMENT ON COLUMN scrape_attempts.outcome IS 
  'Execution result constrained to success, retried, or failed.';
COMMENT ON COLUMN scrape_attempts.current_price IS 
  'Verified current selling price extracted using UI manifest classes (excluding decoys).';
COMMENT ON COLUMN scrape_attempts.stock_text IS 
  'Verified stock text from the stock badge/pill.';
COMMENT ON COLUMN scrape_attempts.parsed_stock_count IS 
  'Extracted numeric stock quantity; 0 if sold out, NULL if unquantified.';
COMMENT ON COLUMN scrape_attempts.duration_ms IS 
  'Total wall-clock duration of this attempt in milliseconds.';

-- ------------------------------------------------------------------------------
-- Practical Indexes
-- ------------------------------------------------------------------------------

-- 1. Fast lookups for active products to scrape during polling runs
CREATE INDEX IF NOT EXISTS idx_tracked_products_active 
  ON tracked_products (is_active) 
  WHERE is_active = true;

-- 2. Primary query path: Price history and scrape log for a specific product
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_product_timeline 
  ON scrape_attempts (tracked_product_id, scraped_at DESC);

-- 3. Filtered index for clean price history charts (only successful data points)
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_successful_history 
  ON scrape_attempts (tracked_product_id, scraped_at DESC) 
  WHERE outcome = 'success';

-- 4. Scraper observability: Monitor failures and retries across the system
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_failures 
  ON scrape_attempts (scraped_at DESC) 
  WHERE outcome IN ('failed', 'retried');

-- ------------------------------------------------------------------------------
-- Convenience View: Latest Price per Tracked Product
-- ------------------------------------------------------------------------------
-- Returns the most recent successful quote for each tracked product.
-- Simplifies the main dashboard display without requiring complex application joins.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_latest_product_prices AS
SELECT DISTINCT ON (tp.id)
  tp.id AS tracked_product_id,
  tp.ine_product_id,
  tp.product_name,
  tp.sku,
  tp.brand,
  tp.category,
  tp.selected_option_id,
  tp.selected_option_label,
  tp.is_active,
  sa.scraped_at AS last_scraped_at,
  sa.current_price,
  sa.currency,
  sa.stock_text,
  sa.parsed_stock_count,
  sa.parsed_in_stock,
  sa.duration_ms
FROM tracked_products tp
LEFT JOIN scrape_attempts sa 
  ON tp.id = sa.tracked_product_id AND sa.outcome = 'success'
ORDER BY tp.id, sa.scraped_at DESC;

COMMENT ON VIEW v_latest_product_prices IS 
  'Convenience view showing the latest confirmed price and stock state per product.';

-- ------------------------------------------------------------------------------
-- Trigger: Automatic updated_at timestamp maintenance on tracked_products
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tracked_products_updated_at ON tracked_products;
CREATE TRIGGER trg_tracked_products_updated_at
  BEFORE UPDATE ON tracked_products
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ------------------------------------------------------------------------------
-- Role Permissions & Grants (PostgREST API)
-- ------------------------------------------------------------------------------
-- Ensure Supabase API roles (anon, authenticated, service_role) have access
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE tracked_products TO anon, authenticated, service_role;
GRANT ALL ON TABLE scrape_attempts TO anon, authenticated, service_role;
GRANT ALL ON v_latest_product_prices TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

