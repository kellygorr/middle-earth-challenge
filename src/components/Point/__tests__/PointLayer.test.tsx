import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';

import PointLayer from '../PointLayer';
import { PointType } from '../../../types';
import { motion } from '../../../styles/motion';

const reachedTrivia = {
  name: 'Reached trivia',
  x: 10,
  y: 10,
  CUMULATIVE_MILES: 0,
} as PointType;

const lockedTrivia = {
  name: 'Locked trivia',
  x: 20,
  y: 20,
  CUMULATIVE_MILES: 1000,
} as PointType;

const checkpoint = {
  name: 'Hobbiton',
  x: 0,
  y: 0,
  CUMULATIVE_MILES: 0,
  isStart: true,
} as PointType;

const renderLayer = async (showActiveTrivia: boolean) =>
  await render(
    <PointLayer
      checkpoints={[checkpoint]}
      trivia={[reachedTrivia, lockedTrivia]}
      uniformScale={1}
      mapOffsetX={0}
      mapOffsetY={0}
      centerX={0}
      centerY={0}
      translateX={{ value: 0 }}
      translateY={{ value: 0 }}
      scale={{ value: 1 }}
      showPointLabels={false}
      showActiveTrivia={showActiveTrivia}
      animatedProgress={0}
      currentMiles={0}
      onItemPress={jest.fn()}
    />,
  );

describe('PointLayer trivia reveal', () => {
  it('hides reached trivia during path reveal but keeps future trivia and checkpoints', async () => {
    await renderLayer(false);

    expect(screen.queryByLabelText('Reached trivia, Trivia')).toBeNull();
    expect(screen.getByLabelText('Locked trivia, Trivia')).toBeTruthy();
    expect(screen.getByLabelText('Hobbiton, Checkpoint, reached')).toBeTruthy();
  });

  it('shows reached trivia after path reveal', async () => {
    await renderLayer(true);

    expect(screen.getByLabelText('Reached trivia, Trivia')).toBeTruthy();
  });

  it('fades reached trivia in when the path reveal completes', async () => {
    const view = await renderLayer(false);
    (withTiming as jest.Mock).mockClear();

    await view.rerender(
      <PointLayer
        checkpoints={[checkpoint]}
        trivia={[reachedTrivia, lockedTrivia]}
        uniformScale={1}
        mapOffsetX={0}
        mapOffsetY={0}
        centerX={0}
        centerY={0}
        translateX={{ value: 0 }}
        translateY={{ value: 0 }}
        scale={{ value: 1 }}
        showPointLabels={false}
        showActiveTrivia
        animatedProgress={0}
        currentMiles={0}
        onItemPress={jest.fn()}
      />,
    );

    expect(withTiming).toHaveBeenCalledWith(1, {
      duration: motion.button.enterDuration,
    });
  });
});
