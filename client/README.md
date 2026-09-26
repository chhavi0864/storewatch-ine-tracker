# StoreWatch Frontend

StoreWatch is a variant-aware price and stock monitoring dashboard for the INE storefront. This React frontend interfaces with the Express backend to track live variant quotes, examine historical attempt logs, and trigger automated browser scrapes.

## Features

- **Catalogue Search**: Debounced live product search against `GET /api/catalog/search?q=`.
- **Variant Inspector & Tracker**: Inspects option axes (e.g. `Light tone`, `Power bundle`) and tracks specific options via `POST /api/tracked-products`. Gracefully handles duplicate tracking conflicts.
- **Real-Time Dashboard**: Displays active tracked items with INR currency formatting (`₹`), current stock state (in-stock, sold-out, unknown), stock quantities, and local/UTC timestamps.
- **Live Scrape Trigger**: Scrapes live browser quotes on demand (`POST /api/tracked-products/:id/scrape`) with per-card busy state and explanatory notifications.
- **Scrape History Modal**: Lists every attempt row from `GET /api/tracked-products/:id/attempts` including outcomes (`success`, `retried`, `failed`), attempt duration, error codes, and strict separation between sold-out items and failed scrapes.
- **CSV Export**: Direct streaming export from `GET /api/tracked-products/:id/export.csv`.

## Architecture & Security Boundary

- **No Direct Supabase Access**: The frontend communicates solely with the Express backend HTTP APIs (`http://localhost:3001`). No Supabase SDK or credentials exist in the client.
- **No Mock Data**: All displayed products, prices, and attempts originate from real database rows and live Playwright scrape runs.

## Environment Setup

Create `.env` inside `client/`:

```bash
cp .env.example .env
```

Ensure `VITE_API_BASE_URL` points to your backend instance:

```env
VITE_API_BASE_URL=http://localhost:3001
```

## Running the Frontend

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
The Vite development server will start at `http://localhost:5173`.

### 3. Production Build
```bash
npm run build
```
Build output is generated in `client/dist/`.
