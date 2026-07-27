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
const KM_PER_MILE = 1.60934;
const METERS_PER_KM = 1000;

/**
 * Kilometers → miles. The internal data model always stores distance in
 * miles; use this at input boundaries to convert user-entered km values
 * before they hit the store / DB.
 */
export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

/**
 * Miles → kilometers. Use at output boundaries when populating an edit
 * input for a user whose display preference is km, so they see and edit
 * the number in the unit they picked.
 */
export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

interface FormatDistanceOptions {
  /** Append unit label (mi/ft or km/m) */
  includeUnits?: boolean;
  /** Always use miles/km, never convert to feet/meters */
  useLargeUnit?: boolean;
  /** Round down to whole number (prevents showing completion early) */
  noDecimals?: boolean;
  /** Use miles (true) or kilometers (false). Default: true (miles) */
  useMiles?: boolean;
}

/**
 * Format distance intelligently:
 * - For values >= 1 mile: show miles (integers without decimals, or 1-2 decimals)
 * - For values < 1 mile: convert to feet for easier understanding
 * - useLargeUnit: always show miles, never convert to feet
 * - noDecimals: round down to whole number
 *
 * Examples:
 *   formatDistance(5) -> "5"
 *   formatDistance(5, true) -> "5 mi"
 *   formatDistance(0.5) -> "2640"
 *   formatDistance(0.5, true) -> "2640 ft"
 *   formatDistance(5.7, { includeUnits: true, noDecimals: true }) -> "5 mi"
 *   formatDistance(0.5, { includeUnits: true, useLargeUnit: true }) -> "0 mi"
 *   formatDistance(5, { includeUnits: true, useMiles: false }) -> "8 km"
 */
export function formatDistance(
  miles: number,
  options: boolean | FormatDistanceOptions = false,
): string {
  // Support legacy boolean parameter for includeUnits
  const opts: FormatDistanceOptions =
    typeof options === 'boolean' ? { includeUnits: options } : options;
  const {
    includeUnits = false,
    useLargeUnit = false,
    noDecimals = false,
    useMiles = true,
  } = opts;

  if (miles === 0) {
    const zeroUnit = useMiles ? 'mi' : 'km';
    return includeUnits ? `0 ${zeroUnit}` : '0';
  }

  // Convert to km if needed
  const distance = useMiles ? miles : miles * KM_PER_MILE;
  const largeUnit = useMiles ? 'mi' : 'km';
  const smallUnit = useMiles ? 'ft' : 'm';
  const smallPerLarge = useMiles ? FEET_PER_MILE : METERS_PER_KM;

  // Handle noDecimals - round down (floor) to prevent early completion display
  // Show "<1" for values between 0 and 1 to indicate progress
  if (noDecimals) {
    const floored = Math.floor(Math.abs(distance)) * Math.sign(distance);
    if (floored === 0 && distance > 0) {
      return includeUnits ? `<1 ${largeUnit}` : '<1';
    }
    return includeUnits ? `${floored} ${largeUnit}` : floored.toString();
  }

  // For useLargeUnit mode or values >= 1 (by magnitude), display in large units
  if (useLargeUnit || Math.abs(distance) >= 1) {
    let value: string;
    if (distance === Math.floor(distance)) {
      value = distance.toString();
    } else {
      // Try 1 decimal first
      const oneDecimal = distance.toFixed(1);
      if (parseFloat(oneDecimal) === distance || distance >= 10) {
        value = oneDecimal;
      } else {
        value = distance.toFixed(2);
      }
      // Remove trailing zeros after decimal
      value = value.replace(/\.?0+$/, '');
    }
    return includeUnits ? `${value} ${largeUnit}` : value;
  }

  // For values < 1, convert to small units
  const smallValue = Math.round(distance * smallPerLarge);
  if (smallValue === 0) return includeUnits ? `>0 ${smallUnit}` : '>0';
  return includeUnits ? `${smallValue} ${smallUnit}` : smallValue.toString();
}
