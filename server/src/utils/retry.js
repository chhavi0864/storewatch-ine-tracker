export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff with a cap.
 * Attempt 1: 1000ms
 * Attempt 2: 2000ms
 * Attempt 3: 4000ms
 */
export function calculateBackoff(attempt, baseMs = 1000, factor = 2, maxMs = 8000) {
  const delay = baseMs * Math.pow(factor, Math.max(0, attempt - 1));
  return Math.min(delay, maxMs);
}
