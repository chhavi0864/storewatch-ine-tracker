# StoreWatch Deployment & External Scheduler Guide

This guide details how to deploy the StoreWatch backend to Render and wire it to [cron-job.org](https://cron-job.org) for automated recurring price & stock monitoring.

---

## 1. Render Deployment (Backend Service)

Because StoreWatch uses Playwright for deterministic browser automation, the Render Web Service must install the Linux Chromium binary and system dependencies during the build step.

### Web Service Settings

| Setting | Value |
| :--- | :--- |
| **Service Type** | Web Service |
| **Runtime** | Node |
| **Root Directory** | `server` |
| **Build Command** | `npm install && npx playwright install --with-deps chromium` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/health` |
| **Plan** | Starter (or Free with sufficient memory for Chromium) |

### Environment Variables on Render

Configure the following variables in the **Environment** tab of your Render service:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | `production` |
| `PLAYWRIGHT_HEADLESS` | Force headless browser | `true` |
| `SCRAPER_TIMEOUT_MS` | Scraper step timeout | `25000` |
| `INE_BASE_URL` | Upstream storefront URL | `https://demo.inelabteamdev.com` |
| `SUPABASE_URL` | Supabase project URL | `https://<YOUR-PROJECT-REF>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase service secret key | *(Your Supabase secret key)* |
| `CRON_SECRET` | Secret token to authenticate cron calls | *(Any secure random string, e.g. `sw_sec_9f81a7b`)* |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173,https://your-frontend.vercel.app` |

> [!NOTE]
> `PORT` is automatically provided by Render (typically port `10000`). The backend server dynamically binds to `process.env.PORT`.

---

## 2. Verifying the Render Deployment

Once Render displays **"Live"**, verify the service using terminal or browser:

### Step 2.1: Health Check
```bash
curl https://<YOUR-RENDER-URL>.onrender.com/health
```
**Expected Response:**
```json
{"status":"ok","timestamp":"2026-09-26T16:35:00.000Z"}
```

### Step 2.2: Verify Unauthorized Cron Rejection
```bash
curl -X POST https://<YOUR-RENDER-URL>.onrender.com/internal/scrape-all
```
**Expected Response (HTTP 401):**
```json
{
  "error": "Unauthorized: missing or invalid x-cron-secret header",
  "code": "UNAUTHORIZED"
}
```

### Step 2.3: Verify Authorized Cron Execution
```bash
curl -X POST https://<YOUR-RENDER-URL>.onrender.com/internal/scrape-all \
  -H "x-cron-secret: <YOUR_CRON_SECRET>"
```
**Expected Response (HTTP 200):**
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
      "price": 18683
    }
  ]
}
```

---

## 3. Configuring the External Scheduler (cron-job.org)

Once your Render backend URL is public, configure the external schedule on [cron-job.org](https://console.cron-job.org/jobs):

1. **Log in** to your [cron-job.org](https://console.cron-job.org/) account.
2. Click **"Create Cronjob"**.
3. Fill in the job details:
   * **Title:** `StoreWatch - Automated Scrape Run`
   * **URL:** `https://<YOUR-RENDER-URL>.onrender.com/internal/scrape-all`
   * **Execution Schedule:**
     * Recommended: **Every 15 minutes** or **Every 30 minutes** (e.g. `*/15 * * * *`).
   * **HTTP Method:** Select **`POST`**.
   * **Headers:**
     * Header Name: `x-cron-secret`
     * Header Value: `<YOUR_CRON_SECRET>`
   * **Advanced Settings:**
     * **Request Timeout:** Set to **120 seconds** (or 180s) to give the headless Playwright scraper adequate time to sequentially process all active tracked products.
     * **Save responses on error:** Enabled.
4. Click **"Create"** or **"Save"**.

---

## 4. Frontend Configuration

When deploying the React frontend (e.g., on Vercel, Netlify, or Render Static Site):

Set the environment variable:
```env
VITE_API_BASE_URL=https://<YOUR-RENDER-URL>.onrender.com
```

Ensure your frontend URL is listed in the backend's `ALLOWED_ORIGINS` variable on Render so CORS requests are permitted.
