import React, { useState, useEffect } from 'react';
import { X, Download, Clock, RefreshCw, AlertCircle, ArrowUpRight, TrendingUp } from 'lucide-react';
import { api } from '../services/api';
import { OutcomeBadge, StockBadge } from './StatusBadge';
import { formatPrice, formatLocalDateTime, formatUtcDateTime, formatDuration, cleanErrorMessage } from '../utils/formatters';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

export function ProductHistory({ product, onClose }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const productId = product.tracked_product_id || product.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchAttempts() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getProductAttempts(productId);
        if (isMounted) {
          setAttempts(data.attempts || []);
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load attempt history');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchAttempts();
    return () => { isMounted = false; };
  }, [productId]);

  const csvUrl = api.getExportCsvUrl(productId);

  // Filter actual successful quotes for price trend calculation
  const successfulAttempts = attempts.filter(a => a.outcome === 'success' && a.current_price !== null);
  const successCount = successfulAttempts.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-modal max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {product.brand || 'Product'} • {product.category || 'Item'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200/60">
                {product.selected_option_label}
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mt-1.5 tracking-tight">
              {product.product_name}
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
              <span>INE ID: <strong className="font-semibold text-slate-600">{product.ine_product_id}</strong></span>
              {product.sku && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>SKU: <code className="font-mono text-slate-500">{product.sku}</code></span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href={csvUrl}
              download
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 rounded-xl shadow-xs transition-all"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download CSV</span>
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading && <LoadingState message="Loading attempt history..." />}
          {error && <ErrorState message={error} />}

          {!loading && !error && attempts.length === 0 && (
            <div className="py-14 text-center text-slate-500 text-sm">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                <Clock className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-800">No scrape attempts recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "Refresh now" on the product card to perform the first live quote scrape.
              </p>
            </div>
          )}

          {!loading && !error && attempts.length > 0 && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Total Scrapes</span>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{attempts.length}</div>
                  <span className="text-xs text-slate-400">Chronological runs</span>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Successful Quotes</span>
                  <div className="text-2xl font-extrabold text-emerald-600 mt-0.5">{successCount}</div>
                  <span className="text-xs text-slate-400">Verified price points</span>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Latest Confirmed Price</span>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
                    {successfulAttempts[0] ? formatPrice(successfulAttempts[0].current_price, successfulAttempts[0].currency) : '—'}
                  </div>
                  <span className="text-xs text-slate-400 truncate block">
                    {successfulAttempts[0] ? formatLocalDateTime(successfulAttempts[0].scraped_at) : 'No successful quote'}
                  </span>
                </div>
              </div>

              {/* Attempt Table */}
              <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y divide-slate-200/80">
                    <thead className="bg-slate-50/90 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Attempt &amp; Time</th>
                        <th className="py-3 px-4">Outcome</th>
                        <th className="py-3 px-4">Price</th>
                        <th className="py-3 px-4">Stock Status</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Diagnostics</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {attempts.map((attempt) => {
                        const isSuccess = attempt.outcome === 'success';
                        const cleanedError = cleanErrorMessage(attempt.error_message);

                        return (
                          <tr key={attempt.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Attempt & Timestamp */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-semibold text-slate-900">
                                Attempt #{attempt.attempt_number}
                              </div>
                              <div className="text-slate-500 mt-0.5 text-xs">
                                {formatLocalDateTime(attempt.scraped_at)}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {formatUtcDateTime(attempt.scraped_at)}
                              </div>
                            </td>

                            {/* Outcome Badge */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <OutcomeBadge outcome={attempt.outcome} />
                            </td>

                            {/* Price */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isSuccess ? (
                                <span className="font-bold text-slate-900 text-sm">
                                  {formatPrice(attempt.current_price, attempt.currency)}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-mono" title="Null by schema integrity rule">—</span>
                              )}
                            </td>

                            {/* Stock */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isSuccess ? (
                                <StockBadge
                                  inStock={attempt.parsed_in_stock}
                                  stockText={attempt.stock_text}
                                  stockCount={attempt.parsed_stock_count}
                                />
                              ) : (
                                <span className="text-slate-300 font-mono" title="Null by schema integrity rule">—</span>
                              )}
                            </td>

                            {/* Duration */}
                            <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-600">
                              {formatDuration(attempt.duration_ms)}
                            </td>

                            {/* Error / Diagnostics */}
                            <td className="py-3.5 px-4 max-w-sm">
                              {!isSuccess && (attempt.error_code || cleanedError) ? (
                                <div className="text-rose-800 bg-rose-50/90 border border-rose-200/70 px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed break-words shadow-2xs font-mono">
                                  {attempt.error_code && <span className="font-bold uppercase mr-1 text-rose-900">{attempt.error_code}:</span>}
                                  <span className="font-normal">{cleanedError || 'Attempt failed'}</span>
                                </div>
                              ) : isSuccess ? (
                                <span className="text-emerald-700 font-medium text-xs flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>DOM Verified</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Informative schema notice */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs text-slate-600 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-slate-800 font-semibold">Data Integrity Rule:</strong> In accordance with StoreWatch database constraints, 
                  retried and failed rows intentionally store <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded text-slate-700">NULL</code> price and stock to prevent 
                  corrupting historical analytics.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
