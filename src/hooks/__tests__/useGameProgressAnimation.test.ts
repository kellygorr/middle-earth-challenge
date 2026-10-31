import { AccessibilityInfo } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { withDelay, withTiming } from 'react-native-reanimated';

import { useGameProgressAnimation } from '../useGameProgressAnimation';
import { mapBookMilesToPathProgress } from '../../utils/pathProgress';

type HookResult = ReturnType<typeof useGameProgressAnimation>;
type HookProps = {
  miles: number | undefined;
  enabled?: boolean;
  activationCycle?: number;
};

describe('useGameProgressAnimation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('jumps to changed progress without timing when Reduce Motion is enabled', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const { result, rerender } = await renderHook<HookResult, HookProps>(
      ({ miles, enabled, activationCycle }) =>
        useGameProgressAnimation(miles, { enabled, activationCycle }),
      { initialProps: { miles: undefined, enabled: true, activationCycle: 0 } },
    );
    await act(async () => {});
    jest.clearAllMocks();

    await rerender({ miles: 100, enabled: true, activationCycle: 0 });

    expect(result.current.gameProgressValue.value).toBe(
      mapBookMilesToPathProgress(100),
    );
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('applies 1s delay on first activation and replays after welcome-cycle reset', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const { rerender } = await renderHook<HookResult, HookProps>(
      ({ miles, enabled, activationCycle }) =>
        useGameProgressAnimation(miles, { enabled, activationCycle }),
      { initialProps: { miles: 150, enabled: false, activationCycle: 0 } },
    );
    await act(async () => {});
    jest.clearAllMocks();
    await rerender({ miles: 150, enabled: true, activationCycle: 0 });
    await waitFor(() => {
      expect(withDelay).toHaveBeenCalledWith(1000, expect.anything());
    });

    jest.clearAllMocks();
    await rerender({ miles: 150, enabled: false, activationCycle: 0 });
    await rerender({ miles: 150, enabled: false, activationCycle: 1 });
    expect(withDelay).not.toHaveBeenCalled();

    await rerender({ miles: 150, enabled: true, activationCycle: 1 });
    await waitFor(() => {
      expect(withDelay).toHaveBeenCalledWith(1000, expect.anything());
    });
    expect((withDelay as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});
