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
  // Only enrich checkpoints with index; trivia passes through unchanged.

  const renderPoint = (
    item: PointType,
    kind: 'checkpoint' | 'trivia',
    index?: number,
  ) => {
    const baseX = item.x * uniformScale - mapOffsetX;
    const baseY = item.y * uniformScale - mapOffsetY;

    const activationProgress = mapBookMilesToPathProgress(
      item.CUMULATIVE_MILES ?? 0,
    );
    const isActive =
      kind === 'checkpoint' && item.isStart
        ? true
        : animatedProgress + 1e-6 >= activationProgress;

    const enriched: PointType = { ...item, index };

    return (
      <PositionedPoint
        key={`${kind}:${item.name}`}
        item={enriched}
        isActive={isActive}
        type={kind}
        baseX={baseX}
        baseY={baseY}
        centerX={centerX}
        centerY={centerY}
        translateX={translateX}
        translateY={translateY}
        scale={scale}
        showLabel={kind === 'checkpoint' && showPointLabels}
        onPress={() => onItemPress(enriched, kind)}
      />
    );
  };

  return (
    <>
      {trivia.map(tr => renderPoint(tr, 'trivia'))}
      {checkpoints.map((cp, i) => renderPoint(cp, 'checkpoint', i))}
    </>
  );
}
