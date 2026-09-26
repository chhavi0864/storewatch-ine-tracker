import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

export function ErrorState({ title = 'Error loading data', message, onRetry }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-5 text-rose-900 my-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-rose-900">{title}</h4>
          {message && <p className="text-sm text-rose-700 mt-1 leading-relaxed">{message}</p>}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
