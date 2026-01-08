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

/**
 * Format miles with one decimal if needed, otherwise as integer.
 * e.g., 5 -> "5", 5.5 -> "5.5", 5.123 -> "5.1"
 */
export function formatMiles(miles: number): string {
  if (miles === Math.floor(miles)) return miles.toString();
  return miles.toFixed(1);
}
