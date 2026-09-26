import React from 'react';
import { RefreshCw, History, Download, ExternalLink, Clock, PackageCheck, AlertCircle, ArrowUpRight } from 'lucide-react';
import { StockBadge } from './StatusBadge';
import { formatPrice, formatLocalDateTime } from '../utils/formatters';
import { api } from '../services/api';
import { LoadingState } from './LoadingState';

export function TrackedProducts({
  products,
  loading,
  refreshingIds,
  scrapeErrors,
  onRefresh,
  onViewHistory,
}) {
  if (loading && (!products || products.length === 0)) {
    return <LoadingState message="Loading tracked products..." />;
  }

  if (!products || products.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/80 p-16 text-center shadow-card">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
          <PackageCheck className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900">No tracked products yet</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
          Search the INE catalogue above to pick a product and monitor its specific variant price and inventory in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((item) => {
        const id = item.tracked_product_id || item.id;
        const isRefreshing = Boolean(refreshingIds[id]);
        const errorMsg = scrapeErrors[id];
        const csvUrl = api.getExportCsvUrl(id);

        return (
          <div
            key={id}
            className={`group bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-card hover:shadow-card-hover ${
              isRefreshing
                ? 'border-brand-400 ring-4 ring-brand-500/10'
                : 'border-slate-200/90 hover:border-slate-300 hover:-translate-y-0.5'
            }`}
          >
            {/* Top Scraping Animated Shimmer Bar */}
            <div className="h-1 w-full bg-slate-100 overflow-hidden">
              {isRefreshing && (
                <div className="h-full w-full bg-gradient-to-r from-brand-500 via-indigo-500 to-sky-400 animate-shimmer" />
              )}
            </div>

            {/* Card Body */}
            <div className="p-5 pb-4">
              {/* Brand & External Link */}
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-semibold text-[11px] uppercase tracking-wider text-slate-600 px-2 py-0.5 rounded-md bg-slate-100/90 border border-slate-200/50">
                  {item.brand || 'Store Item'}
                </span>
                <div className="flex items-center gap-1.5">
                  {item.sku && (
                    <span className="font-mono text-[11px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                      {item.sku}
                    </span>
                  )}
                  <a
                    href={`https://demo.inelabteamdev.com/item/${item.ine_product_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-brand-600 p-1 rounded hover:bg-slate-100 transition-colors"
                    title="View storefront product page"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Title & Category */}
              <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 group-hover:text-brand-900 transition-colors">
                {item.product_name}
              </h3>

              {/* Variant Tag */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200/70 shadow-2xs">
                  <span className="text-slate-500">Option:</span>
                  <span className="font-semibold text-slate-900">{item.selected_option_label}</span>
                </span>
                {item.category && (
                  <span className="text-xs text-slate-400 truncate">
                    {item.category}
                  </span>
                )}
              </div>

              {/* Price & Stock Display Block */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                    {item.current_price !== null && item.current_price !== undefined
                      ? formatPrice(item.current_price, item.currency)
                      : <span className="text-base font-normal text-slate-400 italic">Price locked</span>}
                  </div>
                  <StockBadge
                    inStock={item.parsed_in_stock}
                    stockText={item.stock_text}
                    stockCount={item.parsed_stock_count}
                  />
                </div>

                {/* Last Checked */}
                <div className="flex items-center gap-1.5 mt-2.5 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-400/80" />
                  <span>
                    Last checked: <strong className="font-medium text-slate-600">{formatLocalDateTime(item.last_scraped_at)}</strong>
                  </span>
                </div>

                {/* Refreshing In-Progress Notification */}
                {isRefreshing && (
                  <div className="mt-3 p-3 rounded-xl bg-brand-50/80 border border-brand-200/70 text-xs text-brand-950 flex items-center gap-2.5 shadow-2xs">
                    <RefreshCw className="w-4 h-4 text-brand-600 animate-spin shrink-0" />
                    <span className="font-medium">Checking live quote—this can take 5–30 seconds...</span>
                  </div>
                )}

                {/* Scrape Error Message Banner (if recent manual scrape failed) */}
                {errorMsg && !isRefreshing && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-50/80 border border-rose-200/70 text-xs text-rose-900 flex items-start gap-2.5 shadow-2xs">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">
                      <span className="font-bold">Quote Check Failed: </span>
                      <span>{errorMsg}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Footer */}
            <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onViewHistory(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span>History</span>
                </button>
                <a
                  href={csvUrl}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
                  title="Download scrape history as CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>CSV</span>
                </a>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                disabled={isRefreshing}
                onClick={() => onRefresh(id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition-all shadow-xs focus:outline-none focus:ring-4 focus:ring-brand-500/10 ${
                  isRefreshing
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-white border border-slate-200/90 text-slate-800 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 active:scale-98'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-600' : 'text-slate-600'}`} />
                <span>{isRefreshing ? 'Checking...' : 'Refresh now'}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
