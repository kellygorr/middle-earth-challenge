import { useMemo } from 'react';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import type { PointType } from '../types';

export function useInfoButtonVisibility(
  currentItem: PointType | null,
  itemType: 'checkpoint' | 'trivia' | null,
  isModalVisible: boolean,
  miles: number | undefined,
  animatedProgress: number,
) {
  return useMemo(() => {
    if (!currentItem || isModalVisible) return false;
    const currentMiles = miles || 0;
    const isCheckpointItem = itemType === 'checkpoint';
    const isTriviaItem = itemType === 'trivia';
    const isExact = (a: number, b: number) => Math.abs(a - b) < 1e-6;

    if (isCheckpointItem) {
      const m = currentItem.CUMULATIVE_MILES ?? 0;
      const threshold = mapBookMilesToPathProgress(m);
      return isExact(currentMiles, m) && animatedProgress + 1e-6 >= threshold;
    }
    return isTriviaItem;
  }, [currentItem, itemType, isModalVisible, miles, animatedProgress]);
}
