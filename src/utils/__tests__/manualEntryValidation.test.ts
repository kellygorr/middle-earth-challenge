import {
  MAX_MANUAL_ENTRY_VALUE,
  validateManualEntryInput,
} from '../manualEntryValidation';

describe('validateManualEntryInput', () => {
  it.each(['', ' ', '0', '0.0'])(
    'silently ignores empty or zero input: %p',
    input => {
      expect(validateManualEntryInput(input, false)).toEqual({
        value: null,
        error: null,
      });
    },
  );

  it.each(['words', '12abc', 'NaN'])('rejects malformed input: %p', input => {
    expect(validateManualEntryInput(input, false)).toEqual({
      value: null,
      error: 'Enter a valid number.',
    });
  });

  it('explains negative input', () => {
    expect(validateManualEntryInput('-1', false)).toEqual({
      value: null,
      error: 'Value cannot be negative.',
    });
  });

  it.each([
    'Infinity',
    '+Infinity',
    '1e400',
    String(MAX_MANUAL_ENTRY_VALUE + 1),
  ])('rejects overflow or values above the shared cap: %p', input => {
    expect(validateManualEntryInput(input, false)).toEqual({
      value: null,
      error: 'Maximum entry is 5,000,000.',
    });
  });

  it('accepts the cap in either input mode', () => {
    expect(validateManualEntryInput('5000000', false)).toEqual({
      value: MAX_MANUAL_ENTRY_VALUE,
      error: null,
    });
    expect(validateManualEntryInput('5000000', true)).toEqual({
      value: MAX_MANUAL_ENTRY_VALUE,
      error: null,
    });
  });

  it('requires steps to be whole while allowing decimal distance', () => {
    expect(validateManualEntryInput('10.5', true)).toEqual({
      value: null,
      error: 'Steps must be a whole number.',
    });
    expect(validateManualEntryInput('10.5', false)).toEqual({
      value: 10.5,
      error: null,
    });
  });
});
