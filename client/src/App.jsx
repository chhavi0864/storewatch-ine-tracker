import React, { useState, useEffect, useCallback } from 'react';
import { Eye, ShieldCheck, Activity, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { api } from './services/api';
import { ProductSearch } from './components/ProductSearch';
import { ProductOptionPicker } from './components/ProductOptionPicker';
import { TrackedProducts } from './components/TrackedProducts';
import { ProductHistory } from './components/ProductHistory';
import { ErrorState } from './components/ErrorState';

export function App() {
  const [trackedProducts, setTrackedProducts] = useState([]);
  const [loadingTracked, setLoadingTracked] = useState(true);
  const [trackedError, setTrackedError] = useState(null);

  // Modal states
  const [pickingProduct, setPickingProduct] = useState(null);
  const [historyProduct, setHistoryProduct] = useState(null);

  // Per-card refresh and error tracking
  const [refreshingIds, setRefreshingIds] = useState({});
  const [scrapeErrors, setScrapeErrors] = useState({});

  // Global toast / notification message
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  const loadTrackedProducts = useCallback(async () => {
    setLoadingTracked(true);
    setTrackedError(null);
    try {
      const data = await api.getTrackedProducts();
      setTrackedProducts(data.products || []);
    } catch (err) {
      setTrackedError(err.message || 'Failed to load tracked products');
    } finally {
      setLoadingTracked(false);
    }
  }, []);

  useEffect(() => {
    loadTrackedProducts();
  }, [loadTrackedProducts]);

  const handleRefreshProduct = async (target) => {
    const id = typeof target === 'object' && target !== null
      ? (target.tracked_product_id || target.id)
      : target;
    if (!id) return;

    setRefreshingIds((prev) => ({ ...prev, [id]: true }));
    setScrapeErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      await api.scrapeProduct(id);
      showNotification('Live browser quote updated successfully.', 'success');
      // Refresh list to update prices and last checked time
      await loadTrackedProducts();
    } catch (err) {
      const safeMsg = err.message || 'Scrape attempt failed. Retaining existing quote.';
      setScrapeErrors((prev) => ({ ...prev, [id]: safeMsg }));
      showNotification(safeMsg, 'error');
    } finally {
      setRefreshingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-brand-500/20 selection:text-brand-900">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-modal border text-xs font-semibold transition-all transform animate-in slide-in-from-top-4 duration-200 ${
            notification.type === 'error'
              ? 'bg-rose-50/95 border-rose-200 text-rose-900 backdrop-blur-md'
              : 'bg-emerald-50/95 border-emerald-200 text-emerald-900 backdrop-blur-md'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          ) : (
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* App Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-brand-500/25 ring-2 ring-white">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">
                  StoreWatch
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 uppercase tracking-wider">
                  v2
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Variant-aware INE price &amp; stock tracker
              </p>
            </div>
          </div>

          {/* Scrape Integrity Badge */}
          <div className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-100/90 border border-slate-200/80 text-slate-700 text-xs font-semibold shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Live browser quote scraper</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Search & Add Flow Banner */}
        <section className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-card">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <h2 className="text-base font-bold text-slate-900">
                Track a Product Variant
              </h2>
            </div>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              Search the INE catalogue below. Select any product to inspect its live variant options,
              axes, and start tracking automated quotes.
            </p>
            <ProductSearch onSelectProduct={(product) => setPickingProduct(product)} />
          </div>
        </section>

        {/* Tracked Products Section */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2.5 tracking-tight">
                <span>Active Tracked Products</span>
                {!loadingTracked && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-bold border border-brand-200/60">
                    {trackedProducts.length}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Monitoring locked live quote buttons, variant stock statuses, and price movements.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadTrackedProducts}
                disabled={loadingTracked}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all shadow-xs disabled:opacity-50"
                title="Reload tracked items from server"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTracked ? 'animate-spin text-brand-600' : 'text-slate-500'}`} />
                <span>Reload List</span>
              </button>
            </div>
          </div>

          {trackedError ? (
            <ErrorState message={trackedError} onRetry={loadTrackedProducts} />
          ) : (
            <TrackedProducts
              products={trackedProducts}
              loading={loadingTracked}
              refreshingIds={refreshingIds}
              scrapeErrors={scrapeErrors}
              onRefresh={handleRefreshProduct}
              onViewHistory={(product) => setHistoryProduct(product)}
            />
          )}
        </section>
      </main>

      {/* Option Picker Modal */}
      {pickingProduct && (
        <ProductOptionPicker
          product={pickingProduct}
          onClose={() => setPickingProduct(null)}
          onTrackSuccess={() => {
            showNotification(`Now tracking variant for "${pickingProduct.name}"`, 'success');
            loadTrackedProducts();
          }}
        />
      )}

      {/* History Modal */}
      {historyProduct && (
        <ProductHistory
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200/80 bg-white py-6 text-center text-xs text-slate-400">
        <p className="font-medium">StoreWatch v2 • Deterministic Browser Scraper &amp; Option Tracker • Verified Against Live INE Storefront</p>
      </footer>
    </div>
  );
}

export default App;
