import { ValidationError } from './errors.js';

export function validatePositiveInteger(value, fieldName = 'id') {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ValidationError(`Invalid ${fieldName}: must be a positive integer`);
  }
  return num;
}

export function validateUUID(value, fieldName = 'id') {
  if (typeof value !== 'string') {
    throw new ValidationError(`Invalid ${fieldName}: must be a string`);
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a valid UUID`);
  }
  return value;
}

export function validateNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required and must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Deterministically parses a price string into a numeric amount and currency.
 * Handles inputs like:
 *   "₹20,969", "₹16,864.50", "Rs. 25,737.00", "Rs 1,48,828.00", "20969"
 */
export function parsePrice(priceRaw) {
  if (!priceRaw || typeof priceRaw !== 'string') {
    throw new ValidationError('Price text is required for parsing');
  }

  const trimmed = priceRaw.trim();

  // Detect currency
  let currency = 'INR';
  if (trimmed.includes('₹')) {
    currency = 'INR';
  } else if (/^Rs\.?/i.test(trimmed)) {
    currency = 'INR';
  } else if (trimmed.includes('$')) {
    currency = 'USD';
  } else if (trimmed.includes('€')) {
    currency = 'EUR';
  } else if (trimmed.includes('£')) {
    currency = 'GBP';
  }

  // Extract digits and decimal point, stripping currency symbols, commas, and letters
  const cleaned = trimmed
    .replace(/[^0-9.]/g, '')
    // In case multiple dots are present, keep only the first dot as decimal separator
    .replace(/(\..*?)\..*/g, '$1');

  const numericPrice = Number.parseFloat(cleaned);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new ValidationError(`Price could not be parsed to a positive finite number (raw: "${priceRaw}")`);
  }

  // Round to 2 decimal places
  const roundedPrice = Math.round(numericPrice * 100) / 100;

  return {
    current_price: roundedPrice,
    currency,
  };
}

/**
 * Deterministically parses stock text into stock_text, parsed_stock_count, and parsed_in_stock.
 * Handles inputs like:
 *   "Stock: 73 remaining" -> { stock_text: "Stock: 73 remaining", parsed_stock_count: 73, parsed_in_stock: true }
 *   "Available (52)" -> { stock_text: "Available (52)", parsed_stock_count: 52, parsed_in_stock: true }
 *   "Last few: 106" -> { stock_text: "Last few: 106", parsed_stock_count: 106, parsed_in_stock: true }
 *   "Sold out" -> { stock_text: "Sold out", parsed_stock_count: 0, parsed_in_stock: false }
 */
export function parseStock(stockRaw) {
  if (!stockRaw || typeof stockRaw !== 'string') {
    throw new ValidationError('Stock text is required for parsing');
  }

  const trimmed = stockRaw.trim();
  const isSoldOut = /sold\s*out/i.test(trimmed);

  if (isSoldOut) {
    return {
      stock_text: trimmed,
      parsed_stock_count: 0,
      parsed_in_stock: false,
    };
  }

  // Extract first number if present
  const numberMatch = trimmed.match(/\b\d+\b/);
  const parsedCount = numberMatch ? parseInt(numberMatch[0], 10) : null;

  const inStock = parsedCount !== null ? parsedCount > 0 : true;

  return {
    stock_text: trimmed,
    parsed_stock_count: parsedCount,
    parsed_in_stock: inStock,
  };
}

/**
 * Validates that all mandatory fields for a 'success' outcome are valid.
 */
export function validateSuccessQuote(quote) {
  if (!quote) throw new ValidationError('Quote data is missing');
  
  if (typeof quote.current_price !== 'number' || !Number.isFinite(quote.current_price) || quote.current_price <= 0) {
    throw new ValidationError(`Invalid current_price: must be a positive number (got ${quote.current_price})`);
  }

  // Reject unrealistic fractional prices that indicate partial or decoy extractions
  if (quote.current_price < 1.00) {
    throw new ValidationError(`Invalid current_price: ${quote.current_price} is unrealistically low (likely decoy or partial parse)`);
  }

  if (!quote.currency || typeof quote.currency !== 'string') {
    throw new ValidationError('Currency must be present for a successful quote');
  }

  if (!quote.stock_text || typeof quote.stock_text !== 'string') {
    throw new ValidationError('Stock text must be present for a successful quote');
  }

  if (typeof quote.parsed_in_stock !== 'boolean') {
    throw new ValidationError('parsed_in_stock must be a boolean for a successful quote');
  }

  return true;
}
