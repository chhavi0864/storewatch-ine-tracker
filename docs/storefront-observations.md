# Storefront Observations — demo.inelabteamdev.com

**Investigation date:** 2026-09-26  
**Evidence sources:**
- `scripts/inspect-storefront.js` run logs (`docs/inspect-log.ndjson`)
- Verified client bundle reverse engineering (`/assets/index-GaW5Fnef.js`)
- Screenshots in `docs/screenshots/` (over 60 empirical state captures)
- Browser subagent interactive verification sessions

Every finding below is marked:
- **OBSERVED**: Directly captured and verified in the live DOM / network.
- **TESTED**: Deliberately exercised programmatically with results measured.
- **PROVEN (CODE-LEVEL)**: Confirmed directly by client SPA application source code in the production bundle.

---

## 1. Application Architecture

- **OBSERVED / PROVEN**: The storefront is a React 19 single-page application (`React 19.3.0`).
  - Shell: `https://demo.inelabteamdev.com/` serving `<div id="root"></div>`.
  - JS Bundle: `/assets/index-GaW5Fnef.js` (288 KB, served via nginx/1.30.4).
  - Stylesheet: `/assets/index-a0Mp7OCs.css` (8.7 KB).
- **OBSERVED**: Client-side routing handles all paths under `/item/:id`. Every `/item/:id` returns the identical HTML shell, which renders the product view based on `window.location.pathname`.

---

## 2. Cookie Consent Modal Mechanics

- **OBSERVED / PROVEN**: The cookie banner is not a static CSS popup; it is driven by stochastic anti-automation logic in component `Qr`:
  - **Mount Probability**: 25% chance of appearing per mount (`if (Math.random() > 0.75) return;`).
  - **Asynchronous Appearance Delay**: Mounts after a random timeout between 1,500 ms and 5,000 ms (`Gn = 1500`, `Kn = 5000` ms).
  - **Randomized Placement**: Positions randomized across `bottom`, `top`, or `center` (`Xr = ['bottom', 'top', 'center']`).
  - **DOM Overlay**: Wraps inside `<div class="consent-scrim">` with `body.style.overflow = "hidden"`, trapping keyboard focus and intercepting **all mouse/pointer events** across the entire page.
- **TESTED / PROVEN — Click Resistance**:
  - The modal uses an internal click counter ref `i.current = Zr()`:
    - 70% probability: 1 click required.
    - 25% probability: 2 clicks required.
    - 5% probability: 3 clicks required.
  - The click handler on both buttons is:
    ```js
    let s = useCallback(() => {
      --i.current;
      if (i.current <= 0) t(!1);
    }, []);
    ```
  - **Empirical Confirmation**: In `inspect-log.ndjson` for product 2954, the modal intercepted clicks and required 2 consecutive clicks before `.consent-scrim` unmounted:
    - `clicked Allow cookies (click #1)`
    - `clicked Allow cookies (click #2)`
    - `scrim dismissed or not present`
- **Button Locators**:
  - Allow: `<button type="button" class="ctl ctl-main" aria-label="Allow cookies">Allow</button>`
  - Reject: `<button type="button" class="ctl ctl-plain" aria-label="Reject cookies">Reject</button>`

---

## 3. Product URL Pattern and Catalogue API

- **OBSERVED**:
  - Product page URL: `https://demo.inelabteamdev.com/item/:id` where `:id` is a 4-digit integer (e.g., `2456`, `2954`, `2645`, `2027`, `2051`, `2189`, `2322`).
- **OBSERVED**: Catalogue listings endpoint:
  - `GET /api/v2/listings?page=1&limit=20`
  - Unauthenticated, returns `{ page, perPage, totalPages: 96, count: 960, results: [...] }`.
  - Item fields in catalogue: `id`, `slug`, `name`, `brand`, `category`, `sku`, `description`.
  - SKU format: `SK-{id}-{brand_prefix}` (e.g. `SK-2456-JU`, `SK-2954-SO`, `SK-2645-AU`).

---

## 4. Product Detail API & Metadata

- **OBSERVED**: `GET /api/v2/items/:id`
  - Unauthenticated, returns full product metadata:
    - `id`, `slug`, `name`, `brand`, `category`, `sku`, `description`
    - `specs`: `{ warranty, inTheBox, countryOfOrigin, returns, support, weightGrams, material, colour, modelYear }`
    - `reviews`: Array of `{ id, author, rating, title, body, date, verifiedPurchase, helpfulVotes }`
    - `optionAxis`: string naming the variant dimension (e.g. `"Tone"`, `"Pack"`, `"Level"`, `"Capacity"`)
    - `options`: Array of `{ id, label }` (e.g. `[{ id: "o1", label: "Warm white" }, { id: "o2", label: "Neutral white" }]`)
- **OBSERVED**: Initial page DOM displays title, brand, category, SKU, specs table, review listing, and option picker chips.
- **OBSERVED**: On page load, the price area is completely locked; **no price figures** exist in the DOM initially.

---

## 5. Option / Variant Axis & Behavior

- **OBSERVED / TESTED**:
  - Container: `<div class="opt-picker" role="group" aria-label="{optionAxis}">`
  - Chips:
    - Unselected: `<button type="button" class="opt-chip" aria-pressed="false">{label}</button>`
    - Selected: `<button type="button" class="opt-chip opt-chip-on" aria-pressed="true">{label}</button>`
  - Initial selection: Pre-selects a default option (e.g. `o1` or random item from `options`).
  - Switching options triggers **zero network requests** (`count: 0`).
  - Switching options resets the price component state back to `phase: 'idle'` (locked state), requiring a fresh hover + reveal cycle.

---

## 6. Locked-Price State & Hover/Dwell Mechanics

- **OBSERVED**:
  - Initial container: `<div class="offer-panel offer-locked">`
  - Initial message: `<p class="offer-msg">Price locked</p>`
  - Initial subtext: `<p class="offer-submsg">Hover over the price area to load the current price.</p>`
  - Button: `<button type="button" class="ctl ctl-main" aria-label="Check today’s price" disabled="">Check today’s price</button>`
  - **CRITICAL LOCATOR FACT**: The apostrophe in `"Check today’s price"` is the Unicode Right Single Quotation Mark (`’` / `\u2019`), **not** ASCII straight apostrophe (`'`).
- **PROVEN (CODE-LEVEL) — Client Hover Tracker (`Ar`)**:
  ```js
  class Ar {
    constructor(e) { this.req = e; } // { minMoves: 8, minDwellMs: 600 }
    move(e, t) {
      let n = Date.now();
      if (n - this.lastMoveAt < 40) return; // rate-limits moves: at most 1 every 40ms!
      this.lastMoveAt = n;
      this.hoverAt ||= n;
      this.moves.push([Math.round(e), Math.round(t), n]);
      if (this.moves.length > 40) this.moves.shift();
    }
    missing() {
      if (this.moves.length < this.req.minMoves)
        return "Hover over the price area to load the current price.";
      if (this.hoverAt && Date.now() - this.hoverAt < this.req.minDwellMs)
        return "Hold on — checking availability…";
      return null;
    }
  }
  ```
- **TESTED Mechanics**:
  1. **Move Count Requirement**: Requires at least `8` mousemove events inside the `.offer-panel` bounding box.
  2. **Move Throttle Requirement**: Events closer than `40 ms` apart are discarded by `n - this.lastMoveAt < 40`.
  3. **Dwell Duration Requirement**: Requires at least `600 ms` total elapsed time from the first move event.
  4. **Submessage Progression**:
     - `< 8` moves: `"Hover over the price area to load the current price."`
     - `>= 8` moves but `< 600 ms` dwell: `"Hold on — checking availability…"`
     - `>= 8` moves and `>= 600 ms` dwell: `missing()` returns `null`, submessage updates to `"Check the current price and availability."`, and the button's `disabled` attribute is removed.

---

## 7. Quote API Handshake & Anti-Bot Protection

- **OBSERVED & PROVEN**: Clicking `"Check today’s price"` does not make a simple GET request. It performs a cryptographic challenge handshake:
  1. `GET /api/v2/handshake` → returns challenge payload.
  2. `POST /api/v2/handshake` → sends solved proof-of-work snapshot (including user dwell time, mouse moves array, click timestamp, and `isTrusted` event flag).
  3. Response contains a bearer pass token:
     ```json
     { "pass": "R0VUfC9hcGkvdjIvaXRlbXMvMjQ1Ni9xdW90ZXwyNDU2Om8yfDg2ZTczYzA5...<sig>", "ttlMs": 30000 }
     ```
  4. Client then calls:
     ```http
     GET /api/v2/items/:id/quote?opt=:optionId
     Authorization: Bearer <pass>
     ```
  5. The quote endpoint returns an encrypted payload:
     ```json
     { "itemId": 2456, "option": "o2", "ver": 2, "blob": "FZ0f9ZU0ccltMIgVJp...", "ts": 1790419848856 }
     ```
  6. Client decrypts `blob` using `pass` to extract the quote payload:
     `{ shown, mrp, sale, badgePct, stock, currency, at, rating, ratingCount, seller, deliveryDays, variant, pending, format }`.

---

## 8. Dynamic CSS Obfuscation & Decoys (`/api/v2/ui/manifest`)

- **OBSERVED & PROVEN**: The storefront actively thwarts naive scrapers using two techniques:
  
  ### 1. Dynamic Class Obfuscation via UI Manifest
  On page load, the frontend fetches `GET /api/v2/ui/manifest`:
  ```json
  {
    "revision": 633002,
    "variant": 1,
    "validUntil": 1790421805703,
    "classes": {
      "priceWrap": "qzb-x1",
      "priceValue": "fgy-x1",
      "mrp": "rwq-x1",
      "sale": "myt-x1",
      "badge": "ewn-x1",
      "rating": "kof-x1",
      "seller": "jal-x1",
      "delivery": "vpm-x1",
      "stock": "hdq-x1"
    },
    "order": ["stock", "seller", "delivery", "rating"],
    "priceTag": "data",
    "priceCarrier": "text",
    "ratingAria": true,
    "sellerTitle": true
  }
  ```
  The true elements in `.offer-panel.offer-ready` receive these dynamic session-specific class names.

  ### 2. Hidden Decoy Elements
  The frontend injects hidden decoy spans designed to trap scrapers that look for common class names:
  ```html
  <!-- DECOY 1: Uses standard price-value class, hidden via inline style -->
  <span class="price-value" aria-hidden="true" style="display:none">₹23,293</span>

  <!-- REAL PRICE: Uses manifest-assigned dynamic class and random font rotation class -->
  <span class="v3k7a9 fgy-x1" style="font-family: var(--serif); font-size: 2.4rem; ...">₹20,969</span>

  <!-- DECOY 2: Uses data-price attribute, hidden via inline style -->
  <span class="amount" data-price="true" aria-hidden="true" style="display:none">₹26,078</span>
  ```

---

## 9. Loading, Retry, and Error States

- **OBSERVED / PROVEN**:
  - **Loading State (`phase: 'loading'`)**:
    - Container: `<div class="offer-panel" aria-busy="true" aria-live="polite">`
    - Spinner: `<div class="loader" aria-hidden="true"></div>`
    - Message: `<p class="offer-msg">Loading current price…</p>`
  - **Retry State (`phase: 'retrying'`)**:
    - Max attempts: `jr = 6`
    - Message: `<p class="offer-msg">Retrying (attempt N/6)…</p>`
    - Submsg: `<p class="offer-submsg">Store responded with “...”.</p>`
    - Delay backoff: `300 * attempt` ms
  - **Failed State (`phase: 'error'`)**:
    - Container: `<div class="offer-panel offer-failed" aria-live="assertive">`
    - Message: `<p class="offer-msg">Couldn’t load the price after N attempts.</p>`
    - Button: `<button type="button" class="ctl ctl-main">Retry</button>`

---

## 10. "Check Again" Action & Live Refresh

- **OBSERVED / TESTED**:
  - Once revealed, the footer displays:
    ```html
    <div class="offer-foot">
      <span>Loaded in 1 attempt</span>
      <button type="button" class="ctl ctl-plain ctl-xs">Check again</button>
    </div>
    ```
  - Clicking `"Check again"` makes a fresh handshake and quote request.
  - Live data changes were directly confirmed on Product 2645:
    - Initial quote: `9% saving`, `Delivered in 4 business days`
    - Refreshed quote: `12% saving`, `4-business-day delivery` (`valuesChanged: true`)
    - Attempt counter updates dynamically.

---

## 11. Empirical Product Test Evidence (End-to-End Verified)

Three products were tested end-to-end in headed Playwright using the verified interaction flow:

| Product ID & Name | Selected Option | Hover Unlock Time | Real Price | MRP | Savings % | Stock Status | Seller | Delivery | Decoy Prices Filtered |
|-------------------|-----------------|-------------------|------------|-----|-----------|--------------|--------|----------|-----------------------|
| **2456** — Junova Light Bar Flex | Neutral white (`o2`) | 968 ms | **₹20,969** | ₹37,445 | 44% | Stock: 73 remaining | Ashgrove Depot | Delivered in 6 business days | ₹23,293 / ₹26,078 |
| **2954** — Solvane Mesh System Arc | 2-pack (`o2`) | 1,031 ms | **₹16,864** | ₹54,148 | 60% | Available (52) | Marlowe & Co | Usually delivered in 8 business days | ₹19,371 / ₹21,613 |
| **2645** — Aura Mirror Pro | Standard kit (`o2`) | 988 ms | **₹34,818** | ₹39,566 | 9% → 12% | Sold out | Bright Harbour | Delivered in 4 business days | ₹21,550 / ₹26,166 |

All screenshots and NDJSON logs are persisted in:
- Log: [`docs/inspect-log.ndjson`](file:///c:/Users/Galaxy%20Book%203pro/Desktop/storewatch-v2/docs/inspect-log.ndjson)
- Screenshots: [`docs/screenshots/`](file:///c:/Users/Galaxy%20Book%203pro/Desktop/storewatch-v2/docs/screenshots/)

---

## 12. Complete Robust Locators & Interaction Cheat Sheet

| Interaction / Element | Verified Selector / Locator | Key Rule |
|-----------------------|-----------------------------|----------|
| **Cookie Modal Scrim** | `page.locator('.consent-scrim')` | Block until detached (`waitFor({ state: 'detached' })`) |
| **Cookie Allow Button**| `page.locator('.consent-scrim button[aria-label="Allow cookies"]')` | Must click in a loop up to 3 times until scrim disappears |
| **Option Chips** | `page.locator('button.opt-chip')` | Use `hasText: label` and verify `aria-pressed="true"` |
| **Offer Panel Container** | `page.locator('.offer-panel')` | Modes: `.offer-locked`, `.offer-ready`, `.offer-failed` |
| **Hover Area** | `.offer-panel.offer-locked` bounding box | Move mouse across box: >= 8 moves, >= 40ms apart, >= 600ms total dwell |
| **Check Price Button** | `page.locator('button.ctl.ctl-main[aria-label*="price"]')` | Must use Unicode U+2019 or `aria-label*="price"`. Button enabled when `disabled === null` |
| **UI Manifest Classes** | `GET /api/v2/ui/manifest` | Must use `manifest.classes.priceValue`, `mrp`, etc., to locate true elements |
| **Decoy Avoidance** | Avoid `.price-value` and `.amount` | Both have `style="display:none"` and contain fake numbers |
| **Check Again Button** | `page.locator('button.ctl.ctl-plain.ctl-xs')` | Appears in `.offer-foot` after price reveal |
