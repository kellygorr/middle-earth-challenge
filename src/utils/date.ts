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
