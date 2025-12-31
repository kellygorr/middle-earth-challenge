import { useMemo } from 'react';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';

export function useInfoButtonVisibility(
  currentItem: any | null,
  itemType: 'checkpoint' | 'trivia' | null,
  isModalVisible: boolean,
  miles: number | undefined,
  animatedProgress: number,
) {
  return useMemo(() => {
    if (!currentItem || isModalVisible) return false;
    const currentMiles = miles || 0;
    const isCheckpointItem =
      itemType === 'checkpoint' && 'CUMULATIVE_MILES' in (currentItem || {});
    const isTriviaItem = itemType === 'trivia';
    const isExact = (a: number, b: number) => Math.abs(a - b) < 1e-6;

    if (isCheckpointItem) {
      const m = (currentItem as any).CUMULATIVE_MILES ?? 0;
      const threshold = mapBookMilesToPathProgress(m);
      return isExact(currentMiles, m) && animatedProgress + 1e-6 >= threshold;
    }
    return isTriviaItem;
  }, [currentItem, itemType, isModalVisible, miles, animatedProgress]);
}
