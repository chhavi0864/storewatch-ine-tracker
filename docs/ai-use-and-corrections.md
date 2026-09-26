# AI Use and Engineering Corrections

This document outlines the scope of AI assistance used during the development of StoreWatch v2, alongside key technical discoveries and engineering corrections validated through real browser execution on the INE demo storefront.

---

## 1. Scope of AI Assistance

AI was utilized for:
* **Boilerplate Scaffolding:** Express route and controller templates, Supabase repository patterns, and React component structures.
* **UI Design System:** Tailwind CSS theme tokens, color palettes, and accessible modal layouts.
* **Documentation:** Drafting API contracts, README guidelines, and deployment specifications.

All storefront assumptions, interaction requirements, scraping algorithms, and database constraints were **empirically validated against live browser behavior** on `demo.inelabteamdev.com`.

---

## 2. Key Engineering Discoveries & Corrections

### Correction 1: The Curly-Apostrophe Locator Mismatch
* **Observed Problem:** Initial inspection scripts failed to find or click the quote button when querying for `"Check today's price"`.
* **Root Cause Analysis:** The storefront DOM uses an opening curly single quote/apostrophe (`’`, Unicode `U+2019`) rather than a standard ASCII straight apostrophe (`'`, Unicode `U+0027`):
  ```html
  <button class="ctl ctl-main" aria-label="Check today’s price">Check today’s price</button>
  ```
  Playwright text locators looking for `'Check today\'s price'` failed to match.
* **Resolution:** Replaced rigid string matches with tolerant substring attribute and class locators:
  ```javascript
  const checkBtn = page.locator('button.ctl.ctl-main[aria-label*="price"], button.ctl.ctl-main:has-text("Check today")');
  ```
  This immediately unlocked reliable button discovery across all product pages.

---

### Correction 2: Real Storefront Timeout → Retried Row → Eventual Success
* **Observed Behavior:** On occasional runs, the remote storefront experienced high latency or sluggish animation response times. For example, during testing with **Pinecrest Film Scanner Duo** (Product ID `2645`):
  * **Attempt #1:** Hit Playwright's 15-second safety timeout waiting for `.offer-panel.offer-ready` (`duration_ms: 20757`).
  * **Database Record #1:** Correctly recorded as `outcome: 'retried'` with `current_price: NULL`, `stock_text: NULL`, and `error_code: 'TIMEOUT'` in adherence to the PostgreSQL integrity constraint (`price_stock_outcome_check`).
  * **Attempt #2:** The automated retry mechanism kicked in 8 seconds later, smoothly executed the coordinate sweep, and unlocked the quote in **5.5 seconds** (`outcome: 'success'`, `current_price: 34818`, `stock_text: 'Ready to ship · 119 available'`).
* **Engineering Impact:** Validated that the retry engine self-heals transient storefront latency without corrupting historical price analytics with zero or stale figures.

---

### Correction 3: Obfuscated Multi-Span Price Obfuscation (The "₹8" Price Bug)
* **Observed Behavior:** When scraping **Veloria Lantern Flex** (`/item/2454`), the live browser displayed `₹11,125`, but the dashboard recorded `₹8` (or `₹3`).
* **Root Cause Analysis:** Inspecting the rendered DOM of `.offer-row` revealed anti-scraping DOM obfuscation:
  ```html
  <div class="offer-row">
    <span class="lst-h8" style="text-decoration: line-through;">₹13,638</span>
    <span class="dlx-h8">Member price ₹11,661</span>
    <strong class="v65l12w amt-h8">
      <span>₹​</span><span>1​</span><span>1​</span><span>,​</span><span>1​</span><span>2​</span><span>5</span>
    </strong>
    <span class="tag-h8">26% saving</span>
  </div>
  ```
  1. The storefront splits the real price into individual child `<span>` tags inside `<strong>`, inserting zero-width spaces (`\u200b`).
  2. The initial selector filtered for leaf elements (`el.children.length === 0`). Because `<strong>` had 6 child spans, it was skipped!
  3. The regex then inspected individual digit spans, matching the first single digit span it encountered (`8` or `3`) as a standalone price.
* **Resolution:**
  1. Updated `quoteScraper.js` to prioritize the visible `strong` tag within `.offer-row`.
  2. `strong.textContent` naturally combines all inner child spans into a unified string (`"₹​1​1​,​1​2​5"`).
  3. Passed the combined string through `parsePrice`, which strips zero-width spaces, commas, and currency marks, extracting the exact integer: **`11125`**.

---

### Correction 4: Client Refresh Parameter Object Coercion
* **Observed Problem:** Clicking *"Refresh now"* on newly added cards caused a `400 Bad Request` with the URL:
  `POST /api/tracked-products/[object%20Object]/scrape`
* **Root Cause Analysis:** The card's button click handler passed the full `item` object rather than its string UUID.
* **Resolution:** Implemented defensive parameter unboxing across `TrackedProducts.jsx`, `App.jsx`, and `api.js`:
  ```javascript
  const id = typeof target === 'object' && target !== null 
    ? (target.tracked_product_id || target.id) 
    : target;
  ```
  Ensuring robust type safety regardless of argument shape.
