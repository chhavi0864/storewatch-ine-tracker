/**
 * Formats a numeric price using Indian currency format (e.g. ₹20,969.00 or ₹20,969).
 */
export function formatPrice(amount, currency = 'INR') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '—';
  }

  const num = Number(amount);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: num % 1 === 0 ? 0 : 2,
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
  }).format(num);

  if (currency === 'INR' || currency === '₹') {
    return `₹${formatted}`;
  }
  return `${currency} ${formatted}`;
}

/**
 * Formats an ISO date string into readable local time with timezone.
 */
export function formatLocalDateTime(isoString) {
  if (!isoString) return 'Never checked';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Invalid date';

    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * Formats an ISO date into full UTC timestamp for clarity in audit logs.
 */
export function formatUtcDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  } catch {
    return isoString;
  }
}

/**
 * Formats duration in milliseconds into a friendly string.
 */
export function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Strips ANSI terminal escape sequences and formats error logs for clean UI rendering.
 */
export function cleanErrorMessage(msg) {
  if (!msg) return '';
  // Strip ANSI color and cursor codes like \u001b[2m, \u001b[22m, etc.
  return msg
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\[\d+m/g, '') // Fallback for stripped escape brackets
    .trim();
}

