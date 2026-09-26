import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X, Tag, ExternalLink, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

export function ProductSearch({ onSelectProduct }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef(null);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await api.searchCatalog(query.trim());
        setResults(data.results || []);
        setIsOpen(true);
      } catch (err) {
        setError(err.message || 'Failed to search catalogue');
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside listener to dismiss results dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    onSelectProduct(item);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-brand-600 transition-colors pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length > 0 && setIsOpen(true)}
          placeholder="Search INE catalogue by name, brand, category, or SKU (e.g. 'Redwick', 'Junova', 'Tablet', 'SK-2456')..."
          className="w-full pl-11 pr-11 py-3 bg-slate-50/60 hover:bg-white focus:bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 shadow-xs transition-all duration-150"
        />
        {loading ? (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-600 animate-spin" />
        ) : query ? (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute z-30 mt-2 w-full bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-modal overflow-hidden max-h-88 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">
          {error && (
            <div className="p-4 text-xs font-medium text-rose-700 bg-rose-50/80 border-b border-rose-100">
              {error}
            </div>
          )}

          {!loading && results.length === 0 && query.trim() && (
            <div className="p-8 text-center text-sm text-slate-500">
              No products found for "<span className="font-semibold text-slate-800">{query}</span>"
            </div>
          )}

          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className="w-full text-left px-4 py-3.5 hover:bg-slate-50/90 transition-all flex items-center justify-between group"
            >
              <div className="pr-4 min-w-0">
                <div className="font-semibold text-sm text-slate-900 group-hover:text-brand-600 transition-colors truncate">
                  {item.name}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <span className="font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                    {item.brand}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-600">{item.category}</span>
                  {item.sku && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-slate-400 text-[11px]">{item.sku}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-1 text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-200/60 px-3 py-1.5 rounded-lg opacity-90 group-hover:opacity-100 group-hover:bg-brand-600 group-hover:text-white transition-all shadow-xs">
                <span>View Options</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
