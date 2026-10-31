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

  it('does not start the status pulse when Reduce Motion resolves true', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    render(<StatusBadge label="Syncing" inProgress />);

    await act(async () => {});

    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});
