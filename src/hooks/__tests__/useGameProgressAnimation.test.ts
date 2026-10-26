import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';

import { useGameProgressAnimation } from '../useGameProgressAnimation';
import { mapBookMilesToPathProgress } from '../../utils/pathProgress';

type HookResult = ReturnType<typeof useGameProgressAnimation>;
type HookProps = { miles: number | undefined };

describe('useGameProgressAnimation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('jumps to changed progress without timing when Reduce Motion is enabled', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const { result, rerender } = await renderHook<HookResult, HookProps>(
      ({ miles }) => useGameProgressAnimation(miles),
      { initialProps: { miles: undefined } },
    );
    await act(async () => {});
    jest.clearAllMocks();

    await rerender({ miles: 100 });

    expect(result.current.gameProgressValue.value).toBe(
      mapBookMilesToPathProgress(100),
    );
    expect(withTiming).not.toHaveBeenCalled();
  });
});
