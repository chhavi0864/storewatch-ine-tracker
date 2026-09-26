import React, { useState, useEffect } from 'react';
import { Tag, Check, AlertCircle, Loader2, X, PlusCircle, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

export function ProductOptionPicker({ product, onClose, onTrackSuccess }) {
  const [detail, setDetail] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [duplicateMessage, setDuplicateMessage] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadDetail() {
      setLoading(true);
      setError(null);
      setDuplicateMessage(null);
      try {
        const data = await api.getCatalogDetail(product.id);
        if (isMounted) {
          setDetail(data);
          // Pre-select first option
          if (data.options && data.options.length > 0) {
            setSelectedOptionId(data.options[0].id);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load product specifications');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDetail();
    return () => { isMounted = false; };
  }, [product.id]);

  const handleTrack = async () => {
    if (!selectedOptionId) return;

    setSaving(true);
    setDuplicateMessage(null);
    setError(null);

    try {
      const result = await api.trackProduct(product.id, selectedOptionId);
      onTrackSuccess(result);
      onClose();
    } catch (err) {
      if (err.status === 409 || err.code === 'CONFLICT') {
        const matchedOption = detail?.options?.find(o => o.id === selectedOptionId);
        setDuplicateMessage(
          `"${product.name}" with option "${matchedOption?.label || selectedOptionId}" is already being tracked on your dashboard.`
        );
      } else {
        setError(err.message || 'Failed to add product to tracking list');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedOptionObj = detail?.options?.find(o => o.id === selectedOptionId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-modal max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-2 py-0.5 rounded-md bg-slate-200/70">
                {product.brand}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-medium">{product.category}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-1 leading-snug tracking-tight">
              {product.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {loading && <LoadingState message="Loading variant specifications..." />}

          {error && <ErrorState message={error} />}

          {duplicateMessage && (
            <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold uppercase tracking-wider text-amber-800 text-[10px]">Already Monitored</p>
                <p className="mt-0.5 text-amber-900 leading-relaxed font-medium">{duplicateMessage}</p>
              </div>
            </div>
          )}

          {!loading && detail && (
            <>
              {/* Product Info */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 text-xs text-slate-600 space-y-2 shadow-2xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">SKU</span>
                  <span className="font-mono font-semibold text-slate-800">{detail.sku || 'N/A'}</span>
                </div>
                {detail.specs?.material && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Material</span>
                    <span className="font-semibold text-slate-800">{detail.specs.material}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-400 font-medium">Storefront URL</span>
                  <a
                    href={detail.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:text-brand-800 inline-flex items-center gap-1 font-semibold"
                  >
                    <span>View on INE store</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Option Axis / Variant Chips */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Select {detail.optionAxis || 'Variant'} to Monitor
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Pricing &amp; stock are option-specific
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {detail.options.map((option) => {
                    const isSelected = selectedOptionId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedOptionId(option.id)}
                        className={`flex items-center justify-between p-3.5 rounded-2xl border text-sm font-semibold transition-all ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10 ring-2 ring-slate-900/10'
                            : 'bg-white text-slate-700 border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs'
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-1.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-slate-600 bg-brand-50/50 p-3.5 rounded-2xl border border-brand-100 flex items-center gap-2.5">
                <Tag className="w-4 h-4 text-brand-600 shrink-0" />
                <span>
                  Tracking will monitor <strong className="text-slate-900">{product.name}</strong> ({selectedOptionObj?.label || 'Selected Option'}).
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || saving || !selectedOptionId}
            onClick={handleTrack}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Adding to tracker...</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4" />
                <span>Track this option</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
