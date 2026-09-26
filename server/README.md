# StoreWatch v2 Server

Backend API and Playwright-driven scraper service for monitoring INE storefront product pricing and inventory.

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Configuration](#environment-configuration)
4. [Installation & Setup](#installation--setup)
5. [Running the Server](#running-the-server)
6. [Running the Headed Demo](#running-the-headed-demo)
7. [API Reference](#api-reference)
8. [Database Architecture](#database-architecture)
9. [Scraper Reliability & Anti-Bot Strategy](#scraper-reliability--anti-bot-strategy)

---

## Overview

The StoreWatch v2 server is an Express.js backend that:
- Queries the public INE catalogue and detail APIs for product search and metadata.
- Automates the visible storefront user flow using Playwright to extract live prices and stock.
- Persists tracked products and immutable scrape attempts in Supabase PostgreSQL.
- Provides scheduled cron endpoints and CSV exports.

---

## Prerequisites

- Node.js 18+ (tested on Node v20/v24)
- Playwright browser binaries installed (`npx playwright install chromium`)
- A Supabase project with `supabase/schema.sql` applied

---

## Environment Configuration

Create a file named `server/.env` (use `server/.env.example` as a template):

```ini
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_secret_key_here
CRON_SECRET=your_long_random_cron_token_here
INE_BASE_URL=https://demo.inelabteamdev.com
PLAYWRIGHT_HEADLESS=false
SCRAPER_TIMEOUT_MS=15000
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

> **Security Note:** Never commit `server/.env` to source control. The `SUPABASE_SECRET_KEY` is a backend-only administrative key.

---

## Installation & Setup

From the repository root or the `server/` directory:

```bash
cd server
npm install
npx playwright install chromium
```

---

## Running the Server

### Development mode (with file watcher):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

### Health check:
Visit `http://localhost:3001/health`:
```json
{
  "status": "ok",
  "timestamp": "2026-09-26T17:00:00.000Z",
  "service": "storewatch-server"
}
```

---

## Running the Headed Demo

To test and visually verify the Playwright scraper on a single product-option pair:

```bash
# Default (Product 2456, Neutral white)
npm run demo

# Custom product and option label:
node scripts/headed-demo.js 2954 "2-pack"
node scripts/headed-demo.js 2645 "Standard kit"
```

The script will launch Chromium in headed mode, navigate to the product page, dismiss any cookie consent popups, switch to the requested option chip, sweep across the locked offer panel to trigger the hover unlock, click `"Check today’s price"`, extract and deterministically parse the price and stock, and print a formatted summary.

---

## API Reference

### 1. Catalogue APIs

#### `GET /api/catalog/search?q={query}&limit={limit}`
Search products in the live INE catalogue by name, brand, category, or SKU.
- **Query Params**:
  - `q`: search string (case-insensitive substring match)
  - `limit`: max results (default: 20, max: 100)
- **Response `200 OK`**:
  ```json
  {
    "query": "light",
    "count": 2,
    "results": [
      {
        "id": 2456,
        "slug": "junova-light-bar-flex",
        "name": "Junova Light Bar Flex",
        "brand": "Junova",
        "category": "Lighting",
        "sku": "SK-2456-JU",
        "description": "..."
      }
    ]
  }
  ```

#### `GET /api/catalog/:productId`
Retrieve product specifications, option axis, and available options from public API.
- **Response `200 OK`**:
  ```json
  {
    "id": 2456,
    "slug": "junova-light-bar-flex",
    "name": "Junova Light Bar Flex",
    "brand": "Junova",
    "category": "Lighting",
    "sku": "SK-2456-JU",
    "optionAxis": "Tone",
    "options": [
      { "id": "o1", "label": "Warm white" },
      { "id": "o2", "label": "Neutral white" }
    ],
    "productUrl": "https://demo.inelabteamdev.com/item/2456"
  }
  ```

---

### 2. Tracking APIs

#### `POST /api/tracked-products`
Add a product variant to the tracking list.
- **Request Body**:
  ```json
  {
    "productId": 2456,
    "optionId": "o2"
  }
  ```
- **Response `201 Created`**: Returns the inserted `tracked_products` row.
- **Response `409 Conflict`**: Returned if `(ine_product_id, selected_option_id)` is already tracked.

#### `GET /api/tracked-products`
List all tracked products alongside their most recent confirmed price and stock.
- **Response `200 OK`**:
  ```json
  {
    "count": 1,
    "products": [
      {
        "tracked_product_id": "c1b48b94-845b-4c28-98e3-05b63e8a4a51",
        "ine_product_id": 2456,
        "product_name": "Junova Light Bar Flex",
        "sku": "SK-2456-JU",
        "brand": "Junova",
        "category": "Lighting",
        "selected_option_id": "o2",
        "selected_option_label": "Neutral white",
        "is_active": true,
        "current_price": 20969.00,
        "currency": "INR",
        "stock_text": "Stock: 73 remaining",
        "parsed_stock_count": 73,
        "parsed_in_stock": true,
        "last_scraped_at": "2026-09-26T10:50:49.000Z"
      }
    ]
  }
  ```

#### `GET /api/tracked-products/:id/attempts`
Retrieve the full chronological scrape log for a specific tracked product.
- **Response `200 OK`**:
  ```json
  {
    "tracked_product_id": "c1b48b94-845b-4c28-98e3-05b63e8a4a51",
    "count": 3,
    "attempts": [
      {
        "id": "...",
        "scraped_at": "2026-09-26T10:50:49.000Z",
        "attempt_number": 1,
        "outcome": "success",
        "current_price": 20969.00,
        "currency": "INR",
        "stock_text": "Stock: 73 remaining",
        "parsed_stock_count": 73,
        "parsed_in_stock": true,
        "duration_ms": 2840
      }
    ]
  }
  ```

#### `POST /api/tracked-products/:id/scrape`
Manually trigger an on-demand scrape for a single product variant.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "outcome": "success",
    "attempt_number": 1,
    "data": {
      "current_price": 20969.00,
      "currency": "INR",
      "stock_text": "Stock: 73 remaining",
      "parsed_stock_count": 73,
      "parsed_in_stock": true,
      "duration_ms": 2840
    }
  }
  ```

---

### 3. Scheduled Scrape API

#### `POST /internal/scrape-all`
Secured endpoint intended for recurring external cron triggers (such as cron-job.org).
- **Headers**:
  - `x-cron-secret`: Value must match `CRON_SECRET` configured in environment.
- **Response `200 OK`**:
  ```json
  {
    "total": 3,
    "success": 3,
    "failed": 0,
    "results": [
      {
        "productId": 2456,
        "productName": "Junova Light Bar Flex",
        "option": "Neutral white",
        "outcome": "success",
        "attempt": 1,
        "price": 20969.00
      }
    ]
  }
  ```

---

### 4. CSV Export API

#### `GET /api/tracked-products/:id/export.csv`
Downloads a CSV audit trail of all scrape attempts for the given product.
- **Response**: `Content-Type: text/csv; charset=utf-8`
- **Format**:
  ```csv
  product_id,product_name,selected_option,scraped_at,price,stock,outcome
  2456,"Junova Light Bar Flex","Neutral white",2026-09-26T10:50:49.000Z,20969.00,"Stock: 73 remaining",success
  2456,"Junova Light Bar Flex","Neutral white",2026-09-26T10:45:00.000Z,,,retried
  ```

---

## Database Architecture

The system uses two tables in Supabase PostgreSQL:
1. `tracked_products`: Stores monitored variants (`ine_product_id`, `selected_option_id`).
2. `scrape_attempts`: Append-only history powering price history, scrape logs, and exports.
   - Enforced constraint: `outcome = 'success'` requires non-null price, currency, and stock fields. `retried` and `failed` rows have null price and stock.

Apply the schema using `supabase/schema.sql` via the Supabase SQL Editor.
