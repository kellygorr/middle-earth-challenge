import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  let reduceMotionListener: ((enabled: boolean) => void) | undefined;
  const start = jest.fn();
  const stop = jest.fn();

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
    jest.spyOn(Animated, 'loop').mockReturnValue({
      start,
      stop,
      reset: jest.fn(),
    });
  });

  it('stops the status pulse when Reduce Motion changes', async () => {
    render(<StatusBadge label="Syncing" inProgress />);

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    await act(async () => reduceMotionListener?.(true));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops the status pulse shortly after Reduce Motion resolves true', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    render(<StatusBadge label="Syncing" inProgress />);

    // useReduceMotion now defaults to false (animations on) until the
    // real async check resolves — see its own doc comment for why — so
    // the pulse correctly starts on the very first render, then stops
    // once the real "Reduce Motion: true" value arrives a moment later.
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  });
});
