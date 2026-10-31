import React from 'react';
import { Animated } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import JourneyProgressBar from '../JourneyProgressBar';

jest.mock('../../stores/settingsStore', () => ({
  useTheme: () => ({
    name: 'minimalist',
    colors: {
      textInverted: '#fff',
      textPrimary: '#000',
      modalOverlay2: '#111',
      pathInactive: '#222',
      progressBarActive: '#3a9',
      checkpointTextBackground: '#333',
      checkpointLabel: '#fafafa',
    },
  }),
}));

jest.mock('../../stores/progressStore', () => ({
  useProgressStore: (selector: (state: { getProgressPercentage: () => number }) => unknown) =>
    selector({ getProgressPercentage: () => 42 }),
}));

jest.mock('../../hooks/useReduceMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

jest.mock('../../styles/typography', () => ({
  typographyThemed: () => ({
    caption2Bold: {},
    caption: {},
  }),
}));

describe('JourneyProgressBar', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('uses a 500ms start delay before animating fill', async () => {
    jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
    jest.spyOn(Animated, 'sequence').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
    const delaySpy = jest.spyOn(Animated, 'delay');

    const { getByTestId } = await render(<JourneyProgressBar />);

    fireEvent(getByTestId('journey-progress-bar-track'), 'layout', {
      nativeEvent: { layout: { width: 200 } },
    });

    await waitFor(() => {
      expect(delaySpy).toHaveBeenCalledWith(500);
    });
  });

  it('holds at zero until animation is enabled, then applies delayed start', async () => {
    jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
    jest.spyOn(Animated, 'sequence').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
    const delaySpy = jest.spyOn(Animated, 'delay');

    const { getByTestId, rerender } = await render(
      <JourneyProgressBar startAnimation={false} />,
    );

    fireEvent(getByTestId('journey-progress-bar-track'), 'layout', {
      nativeEvent: { layout: { width: 200 } },
    });
    expect(delaySpy).not.toHaveBeenCalled();

    rerender(<JourneyProgressBar startAnimation={true} />);

    await waitFor(() => {
      expect(delaySpy).toHaveBeenCalledWith(500);
    });
  });
});
