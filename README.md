# StoreWatch v2

> **Variant-aware INE price & stock tracker with deterministic browser automation.**

StoreWatch v2 monitors live, option-specific product prices and inventory levels on the INE e-commerce storefront (`demo.inelabteamdev.com`). It solves the storefront's interaction lock, tracks specific variant options (e.g. color tone, storage, kit sizes), maintains an immutable audit log of every scrape attempt, and streams CSV audit exports.

---

## 1. System Architecture

```
┌─────────────────────────────────┐
│     React + Vite Frontend       │ (Vercel / Netlify / Local port 5173)
│   • Command-palette search      │
│   • Variant option picker modal │
│   • Live dashboard & CSV export │
└────────────────┬────────────────┘
                 │ HTTP REST (JSON)
                 ▼
┌─────────────────────────────────┐
│      Express.js Backend         │ (Render Web Service / Local port 3001)
│   • Public catalogue proxy      │
│   • Scrape runner & retry loop  │
│   • Protected cron endpoint     │
└────────┬───────────────┬────────┘
         │               │
         │ Direct SQL    │ Headless Playwright Browser
         ▼               ▼
┌──────────────────┐  ┌───────────────────────────────────┐
│ Supabase (PG)    │  │ Live INE Storefront               │
│ • tracked_prod   │  │ • Coordinate sweep mouse motion   │
│ • scrape_attempts│  │ • Unlocks "Check today’s price"   │
└──────────────────┘  │ • Extracts obfuscated DOM quote   │
                      └───────────────────────────────────┘
```

* **Frontend:** React 18 + Vite + Tailwind CSS. Connects **strictly** to the Express backend HTTP APIs (`http://localhost:3001` or Render URL). It contains **zero** Supabase keys, zero database credentials, and zero mock/synthetic data.
* **Backend:** Node.js Express server. Encapsulates business logic, database transactions, input validation (UUID / integer sanitization), rate limits, and timing-safe authentication.
* **Database:** Supabase PostgreSQL with an explainable two-table schema: `tracked_products` (the monitoring target) and immutable `scrape_attempts` (the audit log of every scrape run).
* **Scraper Engine:** Deterministic Playwright browser automation interacting exclusively through visible browser DOM actions.

---

## 2. Playwright Visible-UI Scrape Flow

The INE storefront protects live commercial quotes behind an interactive challenge that blocks naive HTTP scrapers:

1. **Page Navigation:** Navigates directly to the target item URL (`/item/:id`) using realistic viewport dimensions.
2. **Cookie Scrim Dismissal:** Identifies and dismisses sticky consent scrims (`.consent-scrim button[aria-label="Allow cookies"]`) with multi-click resistance handling.
3. **Variant Selection:** Locates the specific option button (`button.opt-chip`), scrolls into view, clicks, and verifies that `aria-pressed="true"`.
4. **Coordinate Sweep Movement:** Locates the visible bounding box of `.offer-panel` and performs mouse movements across the panel (minimum 8 moves, ~55ms apart) followed by a dwell delay (~700ms) to satisfy the storefront's interaction detector.
5. **Unlock & Quote Trigger:** Verifies that `button.ctl.ctl-main` transitions from `disabled` to enabled, and clicks *"Check today’s price"*.
6. **Obfuscated DOM Price Extraction:** Waits for `.offer-panel.offer-ready`. Reads the revealed `<strong>` element inside `.offer-row`, joining multi-span character nodes and stripping zero-width spaces (`\u200b`) to extract the true 5-figure price (e.g. `₹11,125`), while explicitly avoiding decoy/hidden elements.
7. **Stock Parsing:** Extracts the inventory status from `.avail-pill` or `.offer-facts` (e.g. *"Ready to ship · 89 available"*, *"Sold out"*).

---

## 3. Database Schema & Integrity Guarantees

The Supabase schema (`supabase/schema.sql`) implements a strict constraint:

```sql
CONSTRAINT price_stock_outcome_check CHECK (
  (outcome = 'success' AND current_price IS NOT NULL) OR
  (outcome IN ('retried', 'failed') AND current_price IS NULL AND stock_text IS NULL)
)
```

* **Truthful Audit Log:** If an attempt encounters a network timeout or storefront lag, it is recorded as `retried` or `failed` with strictly `NULL` price and stock. Fabricated or stale prices are never recorded.
* **Sold Out vs Failed:** When a product is sold out, the scrape is a **success** with `current_price > 0`, `parsed_in_stock = false`, and `stock_text = 'Sold out'`. Scrape failures (timeouts, DOM errors) are strictly categorized as `failed`.

---

## 4. Local Setup & Running

### Prerequisites
* Node.js 18+ (tested on Node v20/v24)
* A Supabase project (or PostgreSQL instance)

### 1. Database Setup
Execute [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL Editor. It creates:
* `tracked_products` table
* `scrape_attempts` table
* Indexes for fast history lookups
* Permissive Row Level Security (RLS) policies for server-side role

### 2. Backend Setup
```bash
cd server
npm install
npx playwright install --with-deps chromium
```

Create `server/.env` (copy from `server/.env.example`):
```env
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key
CRON_SECRET=your-random-cron-secret
INE_BASE_URL=https://demo.inelabteamdev.com
PLAYWRIGHT_HEADLESS=true
SCRAPER_TIMEOUT_MS=25000
ALLOWED_ORIGINS=http://localhost:5173
```

Start the backend:
```bash
npm start
# Server listens on http://localhost:3001
```

### 3. Headed Scraper Demonstration (Optional)
To see Playwright solve the interaction lock visibly in a real browser:
```bash
node scripts/headed-demo.js 2456 "Neutral white"
```

### 4. Frontend Setup
```bash
cd client
npm install
```

Create `client/.env`:
```env
VITE_API_BASE_URL=http://localhost:3001
```

Start the frontend development server:
```bash
npm run dev
# Dashboard available at http://localhost:5173
```

---

## 5. Deployment Plan

### Backend Deployment (Render)
The repository includes [`render.yaml`](render.yaml) for automated Blueprint deployment:
* **Runtime:** Node
* **Root Directory:** `server`
* **Build Command:** `npm install && npx playwright install --with-deps chromium` (installs Linux browser binaries and shared libraries)
* **Start Command:** `npm start`
* **Health Check:** `/health`
* **Environment Variables:** Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `ALLOWED_ORIGINS`, and `PLAYWRIGHT_HEADLESS=true`.

### Frontend Deployment (Vercel / Netlify / Render Static Site)
* **Root Directory:** `client`
* **Build Command:** `npm run build`
* **Output Directory:** `dist`
* **Environment Variable:** `VITE_API_BASE_URL=https://<YOUR-RENDER-BACKEND-URL>.onrender.com`

---

## 6. Scheduled External Cron Architecture

To prevent server resource contention, StoreWatch deliberately relies on an external scheduler rather than internal timers:

1. **Endpoint:** `POST /internal/scrape-all`
2. **Security:** Protected by a constant-time secret check (`x-cron-secret: <CRON_SECRET>`) to prevent unauthorized access.
3. **Execution:** Sequentially iterates across all active tracked products, runs up to 3 attempts with exponential backoff on retries, and writes attempt rows to Supabase.
4. **Scheduler Integration (cron-job.org):**
   * **URL:** `https://<YOUR-RENDER-BACKEND>.onrender.com/internal/scrape-all`
   * **Method:** `POST`
   * **Header:** `x-cron-secret: <YOUR_CRON_SECRET>`
   * **Cadence:** Recommended every 15–30 minutes (`*/15 * * * *`).
   * **Timeout:** Set to 120s–180s to accommodate sequential headless browser runs.

---

## 7. CSV Export

Every tracked product card features a direct **"CSV"** export link:
* **Endpoint:** `GET /api/tracked-products/:id/export.csv`
* **Format:** RFC 4180 standard CSV streamed directly from Express.
* **Fields:** `product_id, product_name, selected_option, scraped_at, price, stock, outcome`
* **Integrity:** Generated directly from database attempt rows without client-side mock data. Unscraped products download headers; completed attempts include timestamps, prices, and stock counts.
