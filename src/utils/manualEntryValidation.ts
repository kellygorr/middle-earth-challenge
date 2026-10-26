export const MAX_MANUAL_ENTRY_VALUE = 5_000_000;
export const MANUAL_ENTRY_SAVE_ERROR = 'Could not save entry. Try again.';
export const MANUAL_ENTRY_DELETE_ERROR = 'Could not delete entry. Try again.';

export type ManualEntryValidation =
  | { value: number; error: null }
  | { value: null; error: string | null };

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function validateManualEntryInput(
  input: string,
  isSteps: boolean,
): ManualEntryValidation {
  const trimmedInput = input.trim();

  if (trimmedInput === '') {
    return { value: null, error: null };
  }
  if (trimmedInput === 'Infinity' || trimmedInput === '+Infinity') {
    return { value: null, error: 'Maximum entry is 5,000,000.' };
  }
  if (!DECIMAL_NUMBER_PATTERN.test(trimmedInput)) {
    return { value: null, error: 'Enter a valid number.' };
  }

  const value = Number(trimmedInput);
  if (value === 0) {
    return { value: null, error: null };
  }
  if (value < 0) {
    return { value: null, error: 'Value cannot be negative.' };
  }
  if (!Number.isFinite(value) || value > MAX_MANUAL_ENTRY_VALUE) {
    return { value: null, error: 'Maximum entry is 5,000,000.' };
  }
  if (isSteps && !Number.isInteger(value)) {
    return { value: null, error: 'Steps must be a whole number.' };
  }

  return { value, error: null };
}
