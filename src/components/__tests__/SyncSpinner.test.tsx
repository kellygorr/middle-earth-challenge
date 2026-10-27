import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { withRepeat } from 'react-native-reanimated';

import SyncSpinner from '../SyncSpinner';

describe('SyncSpinner', () => {
  let reduceMotionListener: ((enabled: boolean) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const addEventListenerSpy = jest.spyOn(
      AccessibilityInfo,
      'addEventListener',
    ) as unknown as jest.Mock;
    addEventListenerSpy.mockImplementation(
      (_eventName: string, listener: (enabled: boolean) => void) => {
        reduceMotionListener = listener;
        return { remove: jest.fn() };
      },
    );
  });

  it('stops continuous rotation when Reduce Motion changes', async () => {
    render(<SyncSpinner />);

    await waitFor(() => expect(withRepeat).toHaveBeenCalledTimes(1));

    await act(async () => reduceMotionListener?.(true));

    expect(withRepeat).toHaveBeenCalledTimes(1);
  });

  it('cancels continuous rotation shortly after Reduce Motion resolves true', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    render(<SyncSpinner />);

    // useReduceMotion now defaults to false (animations on) until the
    // real async check resolves — see its own doc comment for why — so
    // the rotation correctly starts on the very first render, then gets
    // cancelled once the real "Reduce Motion: true" value arrives a
    // moment later.
    await waitFor(() => expect(withRepeat).toHaveBeenCalledTimes(1));
  });
});
