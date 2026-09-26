/**
 * scripts/inspect-storefront.js
 *
 * Phase 1 — Evidence-gathering inspection tool for demo.inelabteamdev.com
 *
 * All locators and timings are based on verified DOM and client-bundle evidence:
 *  - Consent dialog: Randomly rendered (25% chance) between 1500ms and 5000ms.
 *    Contained inside div.consent-scrim.
 *    Requires 1–3 clicks on button[aria-label="Allow cookies"] to decrement internal counter to 0.
 *  - Option chips: button.opt-chip (aria-pressed="false" / "true", opt-chip-on).
 *  - Offer panel: div.offer-panel (modes: .offer-locked, .offer-ready, .offer-failed, or aria-busy="true").
 *  - Hover tracking: Ar client tracker requires minMoves: 8 (each separated by >= 40ms)
 *    and minDwellMs: 600ms inside the offer panel.
 *  - Check price button: button.ctl.ctl-main with aria-label="Check today’s price".
 *  - Revealed price: Server supplies dynamic CSS classes via GET /api/v2/ui/manifest.
 *    Naive scrapers get decoy values (.price-value and .amount [display:none]).
 *  - Check again button: button.ctl.ctl-plain.ctl-xs.
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DOCS_DIR        = path.join(__dirname, '..', 'docs');
const SCREENSHOTS_DIR = path.join(DOCS_DIR, 'screenshots');
const LOG_PATH        = path.join(DOCS_DIR, 'inspect-log.ndjson');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Overwrite log file for clean run
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'w', encoding: 'utf-8' });

function emit(record) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
  console.log(line);
  logStream.write(line + '\n');
}

let ssIndex = 0;
async function ss(page, name) {
  ssIndex++;
  const filename = `${String(ssIndex).padStart(3, '0')}_${name}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false }).catch(() => {});
  emit({ kind: 'SCREENSHOT', label: name, file: filename, status: 'OBSERVED' });
  return filename;
}

// ── network capture ────────────────────────────────────────────────────────────
function startCapture(page) {
  const log = [];
  const bodies = {};

  const onReq = req => {
    log.push({ method: req.method(), url: req.url(), type: req.resourceType() });
  };
  const onResp = async resp => {
    try {
      const url = resp.url();
      const raw = await resp.body().then(b => b.toString('utf-8')).catch(() => null);
      bodies[url] = { status: resp.status(), headers: resp.headers(), body: raw };
    } catch { /* ignore */ }
  };

  page.on('request',  onReq);
  page.on('response', onResp);

  return () => {
    page.off('request',  onReq);
    page.off('response', onResp);
    return log.map(r => ({ ...r, response: bodies[r.url] ?? null }));
  };
}

// ── redact auth / cookie headers ───────────────────────────────────────────────
function redact(resp) {
  if (!resp) return null;
  const SENSITIVE = /auth|token|cookie|secret|pass|key|session|bearer|set-cookie/i;
  const headers = {};
  for (const [k, v] of Object.entries(resp.headers ?? {})) {
    headers[k] = SENSITIVE.test(k) ? '[REDACTED]' : v;
  }
  let topLevelFields = null;
  let bodyPreview    = null;
  if (resp.body) {
    try {
      const parsed  = JSON.parse(resp.body);
      topLevelFields = Object.keys(parsed);
      bodyPreview    = parsed;
    } catch {
      bodyPreview = resp.body.slice(0, 200);
    }
  }
  return { status: resp.status, headers, topLevelFields, bodyPreview };
}

// ── safe poll ─────────────────────────────────────────────────────────────────
async function poll(fn, maxMs = 12_000, stepMs = 100) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return { ok: true, value: v, elapsedMs: maxMs - (end - Date.now()) };
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, stepMs));
  }
  return { ok: false, value: null, elapsedMs: maxMs };
}

// ── robust cookie consent dismissal ───────────────────────────────────────────
// Evidence: Modal is rendered inside div.consent-scrim with an internal counter Zr() (1–3).
// Clicking "Allow" decrements counter; scrim disappears when counter <= 0.
async function ensureConsentDismissed(page) {
  const scrim = page.locator('.consent-scrim');
  const allowBtn = page.locator('.consent-scrim button[aria-label="Allow cookies"]');

  for (let attempt = 1; attempt <= 5; attempt++) {
    const isVis = await scrim.isVisible().catch(() => false);
    if (!isVis) break;

    const btnVis = await allowBtn.isVisible().catch(() => false);
    if (btnVis) {
      await allowBtn.click({ force: true }).catch(() => {});
      emit({ kind: 'COOKIE_CONSENT', status: 'TESTED', action: `clicked Allow cookies (click #${attempt})` });
      await page.waitForTimeout(200);
    } else {
      break;
    }
  }

  // Confirm scrim is detached / hidden
  const stillVis = await scrim.isVisible().catch(() => false);
  if (!stillVis) {
    emit({ kind: 'COOKIE_CONSENT', status: 'OBSERVED', state: 'scrim dismissed or not present' });
  }
}

// ── read all buttons ───────────────────────────────────────────────────────────
async function dumpButtons(page, label) {
  const btns = await page.locator('button').all();
  const out  = [];
  for (const b of btns) {
    out.push({
      text:      (await b.textContent().catch(() => '')).trim(),
      ariaLabel: await b.getAttribute('aria-label').catch(() => null),
      disabled:  await b.getAttribute('disabled').catch(() => null),
      classList: await b.getAttribute('class').catch(() => null),
      visible:   await b.isVisible().catch(() => false),
      outerHTML: await b.evaluate(el => el.outerHTML).catch(() => null),
    });
  }
  emit({ kind: 'BUTTONS', label, status: 'OBSERVED', count: out.length, buttons: out });
  return out;
}

// ── read keyword-matching visible elements ─────────────────────────────────────
async function dumpKeywords(page, label) {
  const kws  = ['price','stock','sold','check','locked','available','saving','seller',
                 'deliver','member','again','refresh','loading','retry','rating'];
  const seen = new Set();
  const out  = [];
  for (const kw of kws) {
    const nodes = page.getByText(new RegExp(kw, 'i'), { exact: false });
    const n     = await nodes.count();
    for (let i = 0; i < n; i++) {
      const el  = nodes.nth(i);
      if (!await el.isVisible().catch(() => false)) continue;
      const html = await el.evaluate(e => e.outerHTML).catch(() => '');
      if (seen.has(html)) continue;
      seen.add(html);
      out.push({
        keyword:   kw,
        tag:       await el.evaluate(e => e.tagName.toLowerCase()).catch(() => null),
        text:      (await el.textContent().catch(() => '')).trim().slice(0, 400),
        classList: await el.getAttribute('class').catch(() => null),
        outerHTML: html.slice(0, 600),
      });
    }
  }
  emit({ kind: 'KEYWORD_ELEMENTS', label, status: 'OBSERVED', count: out.length, elements: out });
  return out;
}

// ── fetch catalogue ────────────────────────────────────────────────────────────
async function fetchCatalogue(page) {
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/v2/listings?page=1&limit=10');
    return { status: res.status, body: await res.text() };
  });
  const parsed = JSON.parse(r.body);
  emit({ kind: 'CATALOGUE_META', status: 'OBSERVED',
    count: parsed.count, totalPages: parsed.totalPages,
    fields: Object.keys(parsed.results[0] ?? {}),
  });
  return parsed.results;
}

// ── fetch ui/manifest ──────────────────────────────────────────────────────────
async function fetchManifest(page) {
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/v2/ui/manifest');
    return { status: res.status, body: await res.text() };
  });
  let manifest = null;
  try { manifest = JSON.parse(r.body); } catch { /* raw logged */ }
  emit({ kind: 'UI_MANIFEST', status: 'OBSERVED', httpStatus: r.status, manifest });
  return manifest;
}

// ── fetch product detail ───────────────────────────────────────────────────────
async function fetchDetail(page, id) {
  const r = await page.evaluate(async id => {
    const res = await fetch(`/api/v2/items/${id}`);
    return { status: res.status, body: await res.text() };
  }, id);
  const detail = JSON.parse(r.body);
  emit({ kind: 'API_ITEM_DETAIL', status: 'OBSERVED', productId: id,
    httpStatus: r.status,
    topLevelFields: Object.keys(detail),
    optionAxis: detail.optionAxis,
    options: detail.options,
  });
  return detail;
}

// ── read revealed price values and decoys ──────────────────────────────────────
async function readRevealedValues(page, manifest, label) {
  // 1. Decoy values (hidden elements)
  const decoyPriceValue = await page.locator('span.price-value').evaluate(el => ({
    text: el.innerText, display: el.style.display, ariaHidden: el.getAttribute('aria-hidden')
  })).catch(() => null);

  const decoyAmount = await page.locator('span.amount[data-price="true"]').evaluate(el => ({
    text: el.innerText, display: el.style.display, ariaHidden: el.getAttribute('aria-hidden')
  })).catch(() => null);

  // 2. Real values using manifest classes
  let realValues = {};
  if (manifest?.classes) {
    const { priceValue, mrp, sale, badge, seller, delivery, stock, rating, priceWrap } = manifest.classes;
    const grab = async (cls) => {
      if (!cls) return null;
      const el = page.locator(`.${cls}`).first();
      return (await el.isVisible().catch(() => false))
        ? (await el.textContent().catch(() => '')).trim()
        : null;
    };

    realValues = {
      priceWrap:    await grab(priceWrap),
      priceValue:   await grab(priceValue),
      mrp:          await grab(mrp),
      sale:         await grab(sale),
      badge:        await grab(badge),
      seller:       await grab(seller),
      delivery:     await grab(delivery),
      stock:        await grab(stock),
      rating:       await grab(rating),
    };
  }

  // 3. Full card text
  const cardText = await page.locator('.offer-panel').evaluate(el => el.innerText).catch(() => null);

  emit({
    kind: 'REVEALED_VALUES', status: 'OBSERVED', label,
    manifestClasses: manifest?.classes,
    decoys: { decoyPriceValue, decoyAmount },
    realValues,
    cardFullText: cardText,
  });

  return { realValues, decoys: { decoyPriceValue, decoyAmount } };
}

// ── main product inspection ────────────────────────────────────────────────────
async function inspectProduct(page, product, manifest) {
  const { id } = product;
  const url = `https://demo.inelabteamdev.com/item/${id}`;
  emit({ kind: 'PRODUCT_START', url, product });

  // Navigate — capture all network requests
  const stopLoad = startCapture(page);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  const loadNet = stopLoad();
  emit({
    kind: 'NETWORK_ON_LOAD', status: 'OBSERVED', productId: id,
    requests: loadNet.map(r => ({
      method: r.method, url: r.url, type: r.type,
      response: redact(r.response),
    })),
  });

  await ss(page, `${id}_A_initial`);

  // Wait a short moment for possible consent modal timer (1.5s - 5s) and dismiss if it appears
  await page.waitForTimeout(1600);
  await ensureConsentDismissed(page);

  // Get detail and options
  const detail = await fetchDetail(page, id);
  const { optionAxis, options = [] } = detail;

  // Dump initial state
  await dumpButtons(page, `${id}_A_initial`);
  await dumpKeywords(page, `${id}_A_initial`);

  // ── Option selection ───────────────────────────────────────────────────────
  // Select options[1] to test non-default selection and observe aria-pressed flip
  let chosenOption = options[0] ?? null;
  if (options.length > 1) {
    const target = options[1];
    await ensureConsentDismissed(page);

    const btn = page.locator('button.opt-chip', { hasText: target.label });
    if (await btn.count().then(c => c > 0).catch(() => false)) {
      const stopOpt = startCapture(page);
      await btn.first().click();
      const flip = await poll(async () => {
        const p = await btn.first().getAttribute('aria-pressed').catch(() => null);
        return p === 'true';
      }, 4_000);
      const optNet = stopOpt();
      emit({
        kind: 'OPTION_SELECTED', status: 'TESTED',
        targetLabel: target.label, targetId: target.id,
        ariaPressedFlipped: flip.ok, elapsedMs: flip.elapsedMs,
        networkRequests: optNet.length,
      });
      chosenOption = target;
      await ss(page, `${id}_B_option_${target.label.replace(/\s+/g, '_')}`);
      await dumpButtons(page, `${id}_B_option_selected`);
    }
  }
  emit({ kind: 'CHOSEN_OPTION', status: 'TESTED', option: chosenOption });

  // ── Locate the offer-locked panel ──────────────────────────────────────────
  const panel = page.locator('.offer-panel.offer-locked');
  const panelBox = await panel.boundingBox().catch(() => null);

  emit({
    kind: 'PRICE_BOX_BOUNDS', status: 'OBSERVED', productId: id,
    bounds: panelBox,
  });

  // ── Check-price button state before hover ──────────────────────────────────
  const checkBtn = page.locator('button.ctl.ctl-main[aria-label*="price"]');
  const btnBefore = {
    text:      (await checkBtn.textContent().catch(() => '')).trim(),
    disabled:  await checkBtn.getAttribute('disabled').catch(() => null),
    ariaLabel: await checkBtn.getAttribute('aria-label').catch(() => null),
    classList: await checkBtn.getAttribute('class').catch(() => null),
    outerHTML: await checkBtn.evaluate(el => el.outerHTML).catch(() => null),
  };
  emit({ kind: 'CHECK_BTN_BEFORE_HOVER', status: 'OBSERVED', ...btnBefore });

  // ── Controlled Hover & Dwell Test ──────────────────────────────────────────
  // Verified requirement: minMoves: 8 (interval >= 40ms) and minDwellMs: 600ms
  emit({ kind: 'HOVER_START', status: 'TESTED', bounds: panelBox });
  const stopHoverNet = startCapture(page);
  let hoverT0 = Date.now();
  const observedSubmsgStates = [];

  let unlocked = false;
  for (let sweepAttempt = 1; sweepAttempt <= 3; sweepAttempt++) {
    await ensureConsentDismissed(page);

    if (panelBox) {
      const y  = panelBox.y + panelBox.height / 2;
      const x0 = panelBox.x + 30;
      const x1 = panelBox.x + panelBox.width - 30;

      await page.mouse.move(x0, y);
      hoverT0 = Date.now();
      const sub0 = await page.locator('p.offer-submsg').textContent().catch(() => '');
      if (sub0 && !observedSubmsgStates.find(s => s.text === sub0.trim())) {
        observedSubmsgStates.push({ step: 0, text: sub0.trim() });
      }

      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        if (await page.locator('.consent-scrim').isVisible().catch(() => false)) {
          emit({ kind: 'CONSENT_DURING_HOVER', status: 'OBSERVED', sweepAttempt });
          await ensureConsentDismissed(page);
          break; // Scrim interrupted pointer events; restart sweep
        }

        const curX = x0 + (x1 - x0) * (i / steps);
        await page.mouse.move(curX, y);
        await new Promise(r => setTimeout(r, 55));

        const sub = await page.locator('p.offer-submsg').textContent().catch(() => '');
        if (sub && !observedSubmsgStates.find(s => s.text === sub.trim())) {
          observedSubmsgStates.push({ step: i, text: sub.trim() });
        }
      }
    }

    // Ensure minimum dwell time (>= 600ms) before checking
    const remainingDwell = Math.max(0, 650 - (Date.now() - hoverT0));
    if (remainingDwell > 0) await new Promise(r => setTimeout(r, remainingDwell));

    const dis = await checkBtn.getAttribute('disabled').catch(() => 'err');
    if (dis === null) {
      unlocked = true;
      break;
    }
  }

  // Poll to confirm final unlock
  const unlock = await poll(async () => {
    const dis = await checkBtn.getAttribute('disabled').catch(() => 'err');
    return dis === null;
  }, 2_000, 100);

  const hoverNet = stopHoverNet();

  emit({
    kind: 'HOVER_RESULT', status: 'TESTED',
    buttonUnlocked: unlock.ok || unlocked,
    unlockElapsedMs: (unlock.ok || unlocked) ? Date.now() - hoverT0 : null,
    submsgProgression: observedSubmsgStates,
    hoverNetworkRequests: hoverNet.length,
  });

  const subAfter = await page.locator('p.offer-submsg').textContent().catch(() => null);
  emit({ kind: 'OFFER_SUBMSG_AFTER_HOVER', status: 'OBSERVED', text: subAfter?.trim() });

  const btnAfterHover = {
    text:      (await checkBtn.textContent().catch(() => '')).trim(),
    disabled:  await checkBtn.getAttribute('disabled').catch(() => null),
    ariaLabel: await checkBtn.getAttribute('aria-label').catch(() => null),
    classList: await checkBtn.getAttribute('class').catch(() => null),
    outerHTML: await checkBtn.evaluate(el => el.outerHTML).catch(() => null),
  };
  emit({ kind: 'CHECK_BTN_AFTER_HOVER', status: 'OBSERVED', ...btnAfterHover });
  await ss(page, `${id}_C_after_hover`);

  // ── Click and observe reveal ───────────────────────────────────────────────
  const canClick = await checkBtn.isEnabled().catch(() => false);
  emit({ kind: 'PRE_CLICK', status: 'OBSERVED', buttonEnabled: canClick });

  if (!canClick) {
    emit({ kind: 'NOTE', status: 'UNVERIFIED', msg: 'Button still disabled after hover' });
    return;
  }

  await ensureConsentDismissed(page);

  const stopClickNet = startCapture(page);
  const clickT0      = Date.now();

  await checkBtn.click();
  await ss(page, `${id}_D_post_click`);

  // Observe loading state (.loader and aria-busy="true")
  const loadingObserved = await page.locator('.offer-panel[aria-busy="true"]').isVisible().catch(() => false);
  const loaderObserved  = await page.locator('.offer-panel .loader').isVisible().catch(() => false);
  emit({
    kind: 'LOADING_STATE', status: 'OBSERVED',
    panelAriaBusy: loadingObserved,
    loaderSpinner: loaderObserved,
  });

  // Poll until offer panel transitions to .offer-ready (or .offer-failed)
  const reveal = await poll(async () => {
    const isReady  = await page.locator('.offer-panel.offer-ready').isVisible().catch(() => false);
    const isFailed = await page.locator('.offer-panel.offer-failed').isVisible().catch(() => false);
    return isReady ? 'ready' : isFailed ? 'failed' : false;
  }, 25_000, 150);

  const clickNet = stopClickNet();

  emit({
    kind: 'CLICK_RESULT', status: 'TESTED',
    resultState: reveal.value,
    revealedWithinMs: reveal.ok ? Date.now() - clickT0 : null,
    networkRequests: clickNet.map(r => ({
      method: r.method, url: r.url, type: r.type,
      response: redact(r.response),
    })),
  });

  await ss(page, `${id}_E_revealed`);
  await dumpKeywords(page, `${id}_E_revealed`);
  await dumpButtons(page, `${id}_E_revealed`);

  // Extract revealed real values and decoy values
  const revealedData = await readRevealedValues(page, manifest, `${id}_E_revealed`);

  // ── Check-again button test ────────────────────────────────────────────────
  const checkAgainBtn = page.locator('button.ctl.ctl-plain.ctl-xs');
  const againCount    = await checkAgainBtn.count().catch(() => 0);
  let checkAgainProps = null;
  if (againCount > 0) {
    checkAgainProps = {
      text:      (await checkAgainBtn.first().textContent().catch(() => '')).trim(),
      ariaLabel: await checkAgainBtn.first().getAttribute('aria-label').catch(() => null),
      classList: await checkAgainBtn.first().getAttribute('class').catch(() => null),
      outerHTML: await checkAgainBtn.first().evaluate(el => el.outerHTML).catch(() => null),
    };
  }
  emit({
    kind: 'CHECK_AGAIN_BTN', status: againCount > 0 ? 'OBSERVED' : 'UNVERIFIED',
    count: againCount, ...checkAgainProps,
  });

  if (againCount > 0) {
    await ensureConsentDismissed(page);
    const stopAgainNet = startCapture(page);
    const againT0      = Date.now();

    await checkAgainBtn.first().click();

    // Wait until .offer-ready is stable
    const reReveal = await poll(async () => {
      return await page.locator('.offer-panel.offer-ready').isVisible().catch(() => false);
    }, 15_000, 200);

    const againNet = stopAgainNet();
    await ss(page, `${id}_F_check_again_revealed`);

    const againData = await readRevealedValues(page, manifest, `${id}_F_check_again`);

    emit({
      kind: 'CHECK_AGAIN_RESULT', status: 'TESTED',
      elapsedMs: Date.now() - againT0,
      revealed: reReveal.ok,
      networkRequests: againNet.map(r => ({
        method: r.method, url: r.url, type: r.type,
        response: redact(r.response),
      })),
      valuesChanged: JSON.stringify(revealedData.realValues) !== JSON.stringify(againData.realValues),
      firstValues: revealedData.realValues,
      againValues: againData.realValues,
    });
  }

  // ── Error / alert check ────────────────────────────────────────────────────
  const alertVis = await page.getByRole('alert').isVisible().catch(() => false);
  emit({
    kind: 'ERROR_STATE', status: 'OBSERVED', alertVisible: alertVis,
    text: alertVis ? (await page.getByRole('alert').textContent().catch(() => '')).trim() : null,
  });

  emit({ kind: 'PRODUCT_END', url, chosenOption });
}

// ── main entry point ───────────────────────────────────────────────────────────
(async () => {
  emit({ kind: 'RUN_START', target: 'https://demo.inelabteamdev.com/' });

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // 1. Homepage load
    const stopHome = startCapture(page);
    await page.goto('https://demo.inelabteamdev.com/', { waitUntil: 'networkidle', timeout: 30_000 });
    const homeNet = stopHome();
    await ss(page, '000_homepage');
    emit({
      kind: 'HOMEPAGE_NETWORK', status: 'OBSERVED',
      requests: homeNet.map(r => ({
        method: r.method, url: r.url,
        response: r.response ? { status: r.response.status } : null,
      })),
    });

    // Handle initial cookie consent
    await page.waitForTimeout(1600);
    await ensureConsentDismissed(page);

    // 2. Fetch manifest & catalogue
    const manifest = await fetchManifest(page);
    const products = await fetchCatalogue(page);
    emit({ kind: 'PRODUCTS_SAMPLED', status: 'OBSERVED', count: products.length });

    // Inspect at least three products end-to-end (prompt requires at least three products)
    const targets = products.slice(0, 3);
    for (const product of targets) {
      await inspectProduct(page, product, manifest);
    }

  } catch (err) {
    emit({ kind: 'FATAL_ERROR', message: err.message, stack: err.stack });
    await ss(page, 'fatal_error').catch(() => {});
  } finally {
    await browser.close();
    logStream.end();
    console.log(`\n=== DONE — ${LOG_PATH} ===`);
  }
})();
