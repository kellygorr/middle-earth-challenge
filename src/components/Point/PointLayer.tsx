import React from 'react';
import PositionedPoint from './PositionedPoint';
import { mapBookMilesToPathProgress } from '../../utils/pathProgress';
import { PointType } from '../../types';

type Props = {
  checkpoints: PointType[];
  trivia: PointType[];
  uniformScale: number;
  mapOffsetX: number;
  mapOffsetY: number;
  centerX: number;
  centerY: number;
  translateX: any;
  translateY: any;
  scale: any;
  showPointLabels: boolean;
  animatedProgress: number;
  onItemPress: (item: PointType, type: 'checkpoint' | 'trivia') => void;
};

export default function PointLayer({
  checkpoints,
  trivia,
  uniformScale,
  mapOffsetX,
  mapOffsetY,
  centerX,
  centerY,
  translateX,
  translateY,
  scale,
  showPointLabels,
  animatedProgress,
  onItemPress,
}: Props) {
  const items = [...trivia, ...checkpoints];

  return (
    <>
      {items.map(item => {
        const baseX = item.x * uniformScale - mapOffsetX;
        const baseY = item.y * uniformScale - mapOffsetY;
        const isCheckpoint = 'checkpointActivationMiles' in item;
        const type = isCheckpoint ? 'checkpoint' : 'trivia';

        let isActive = false;
        if (isCheckpoint) {
          const centerMiles = item.CUMULATIVE_MILES ?? 0;
          const centerProgress = mapBookMilesToPathProgress(centerMiles);
          isActive = item.isStart
            ? true
            : animatedProgress + 1e-6 >= centerProgress;
        } else {
          const activationProgress = mapBookMilesToPathProgress(
            item.CUMULATIVE_MILES,
          );
          isActive = animatedProgress + 1e-6 >= activationProgress;
        }

        if (!isCheckpoint && !isActive) return null;

        return (
          <PositionedPoint
            key={item.name}
            item={item}
            isActive={isActive}
            type={type}
            baseX={baseX}
            baseY={baseY}
            centerX={centerX}
            centerY={centerY}
            translateX={translateX}
            translateY={translateY}
            scale={scale}
            showLabel={isCheckpoint && showPointLabels}
            onPress={() => onItemPress(item, type)}
          />
        );
      })}
    </>
  );
}
