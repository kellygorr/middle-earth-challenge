/**
 * Format a timestamp or YYYY-MM-DD string into a user-friendly date label,
 * e.g., "Dec 31, 2025".
 */
export function formatDateLabel(dateValue: number | string): string {
  try {
    const d =
      typeof dateValue === 'number'
        ? new Date(dateValue)
        : new Date(`${dateValue}T00:00:00`);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(dateValue);
  }
}

/**
 * Format a timestamp or YYYY-MM-DD string into a short date label,
 * e.g., "Dec 31" (without year).
 */
export function formatShortDateLabel(dateValue: number | string): string {
  try {
    const d =
      typeof dateValue === 'number'
        ? new Date(dateValue)
        : new Date(`${dateValue}T00:00:00`);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(dateValue);
  }
}

/**
 * Get the year from a timestamp or YYYY-MM-DD string.
 */
export function getYear(dateValue: number | string): number {
  try {
    const d =
      typeof dateValue === 'number'
        ? new Date(dateValue)
        : new Date(`${dateValue}T00:00:00`);
    return d.getFullYear();
  } catch {
    return 0;
  }
}

/**
 * Format a timestamp into a time string, e.g., "3:45 PM".
 */
export function formatTime(dateValue: number): string {
  try {
    const d = new Date(dateValue);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/**
 * Format a Date object into a user-friendly date label, e.g., "Dec 31, 2025".
 * Returns '—' for null values.
 */
export function formatDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const FEET_PER_MILE = 5280;

/**
 * Format distance intelligently:
 * - For values >= 1 mile: show miles (integers without decimals, or 1-2 decimals)
 * - For values < 1 mile: convert to feet for easier understanding
 * - Optional includeUnits parameter to append unit label
 *
 * Examples:
 *   formatDistance(5) -> "5"
 *   formatDistance(5, true) -> "5 mi"
 *   formatDistance(0.5) -> "2640"
 *   formatDistance(0.5, true) -> "2640 ft"
 */
export function formatDistance(miles: number, includeUnits = false): string {
  if (miles === 0) return includeUnits ? '0 mi' : '0';

  // For values >= 1 mile, display in miles
  if (miles >= 1) {
    let value: string;
    if (miles === Math.floor(miles)) {
      value = miles.toString();
    } else {
      // Try 1 decimal first
      const oneDecimal = miles.toFixed(1);
      if (parseFloat(oneDecimal) === miles || miles >= 10) {
        value = oneDecimal;
      } else {
        value = miles.toFixed(2);
      }
      // Remove trailing zeros after decimal
      value = value.replace(/\.?0+$/, '');
    }
    return includeUnits ? `${value} mi` : value;
  }

  // For values < 1 mile, convert to feet
  const feet = Math.round(miles * FEET_PER_MILE);
  if (feet === 0) return includeUnits ? '>0 ft' : '>0';
  return includeUnits ? `${feet} ft` : feet.toString();
}
