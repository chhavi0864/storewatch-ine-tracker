import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingState({ message = 'Loading...', inline = false }) {
  if (inline) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
        <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-3" />
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}
