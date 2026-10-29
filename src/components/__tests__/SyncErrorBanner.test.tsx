import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  within,
} from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import SyncErrorBanner from '../SyncErrorBanner';
import {
  useProgressStore,
  type TroubleshootingIssue,
} from '../../stores/progressStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';

const stoppedIssue: TroubleshootingIssue = {
  error: {
    kind: 'pedometerServiceStopped',
    lastCommitAt: new Date('2026-08-20T12:00:00Z').getTime(),
    staleForMs: 20 * 60 * 60 * 1000,
    manufacturer: 'Samsung',
  },
  at: new Date('2026-08-21T08:00:00Z').getTime(),
  dismissedAt: null,
  resolvedAt: null,
};

const fallbackIssue: TroubleshootingIssue = {
  error: {
    kind: 'sourceFallback',
    unavailableSource: 'pedometer',
    activeSource: 'health-app',
  },
  at: stoppedIssue.at,
  dismissedAt: null,
  resolvedAt: null,
};

const providerIssue: TroubleshootingIssue = {
  error: {
    kind: 'provider',
    provider: 'apple-health',
    message: 'HealthKit unavailable',
  },
  at: stoppedIssue.at,
  dismissedAt: null,
  resolvedAt: null,
};

describe('SyncErrorBanner', () => {
  beforeEach(() => {
    useProgressStore.setState({ troubleshootingIssues: [] });
    useSettingsStore.setState({ useMiles: true });
    useUIStore.setState({ modalStack: [] });
  });

  it.each(['timeout', 'provider'] as const)(
    'only renders the %s footer when the retry button is available',
    async kind => {
      useProgressStore.setState({
        troubleshootingIssues: [
          {
            ...providerIssue,
            error:
              kind === 'timeout'
                ? {
                    kind,
                    chunkStart: stoppedIssue.at,
                    chunkEnd: stoppedIssue.at,
                    chunksDone: 0,
                    chunksTotal: 1,
                  }
                : providerIssue.error,
          },
        ],
      });
      useSettingsStore.setState({
        syncEnabled: true,
        syncProvider: 'apple-health',
        trackingMode: 'health-app',
      });

      const { rerender } = await render(<SyncErrorBanner />);

      expect(
        screen.getByTestId('troubleshooting-issue-footer'),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Sync' })).toBeOnTheScreen();

      for (const settings of [
        {
          syncEnabled: false,
          syncProvider: 'apple-health',
          trackingMode: 'health-app',
        },
        {
          syncEnabled: true,
          syncProvider: 'none',
          trackingMode: 'health-app',
        },
        {
          syncEnabled: true,
          syncProvider: 'apple-health',
          trackingMode: 'dual',
        },
      ] as const) {
        await act(async () => {
          useSettingsStore.setState(settings);
        });
        await rerender(<SyncErrorBanner />);

        expect(screen.queryByTestId('troubleshooting-issue-footer')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Sync' })).toBeNull();
      }
    },
  );

  it('omits the footer for errors without actions', async () => {
    useProgressStore.setState({
      troubleshootingIssues: [
        {
          ...stoppedIssue,
          error: { kind: 'pedometerStorage', message: 'Storage failed' },
        },
      ],
    });

    await render(<SyncErrorBanner />);

    expect(screen.getByText('Pedometer storage failed')).toBeOnTheScreen();
    expect(screen.queryByTestId('troubleshooting-issue-footer')).toBeNull();
  });

  it('only renders the unavailable footer on Android', async () => {
    useProgressStore.setState({
      troubleshootingIssues: [
        {
          ...providerIssue,
          error: { kind: 'unavailable', message: 'Health app unavailable' },
        },
      ],
    });

    await render(<SyncErrorBanner />);

    expect(!!screen.queryByTestId('troubleshooting-issue-footer')).toBe(
      Platform.OS === 'android',
    );
    expect(!!screen.queryByText('Open Play Store')).toBe(
      Platform.OS === 'android',
    );
  });

  it('renders stopped-service recovery guidance and both actions', async () => {
    const user = userEvent.setup();
    useProgressStore.setState({ troubleshootingIssues: [stoppedIssue] });

    await render(<SyncErrorBanner />);

    expect(screen.getByText('Step counting stopped')).toBeOnTheScreen();
    expect(
      screen.getByTestId('troubleshooting-issue-footer'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Problem')).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Samsung's Device Care can put apps to sleep, which can stop step tracking.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Solution')).toBeOnTheScreen();
    expect(screen.getByText('Add catch-up miles')).toBeOnTheScreen();

    await user.press(screen.getByText('Sync settings'));
    expect(useUIStore.getState().modalStack).toEqual([{ type: 'sync' }]);

    await user.press(screen.getByLabelText('Add miles'));
    expect(useUIStore.getState().modalStack).toEqual([
      { type: 'sync' },
      { type: 'distance' },
    ]);
  });

  it('uses the selected distance unit for catch-up entry', async () => {
    useProgressStore.setState({ troubleshootingIssues: [stoppedIssue] });
    useSettingsStore.setState({ useMiles: false });

    await render(<SyncErrorBanner />);

    expect(screen.getByText('Add catch-up kilometers')).toBeOnTheScreen();
    expect(screen.getByLabelText('Add kilometers')).toBeOnTheScreen();
  });

  it('sizes and snaps multiple cards while dismissing only the chosen slot', async () => {
    useProgressStore.setState({
      troubleshootingIssues: [stoppedIssue, fallbackIssue, providerIssue],
    });

    await render(<SyncErrorBanner bleed={24} />);
    await fireEvent(
      screen.getByTestId('troubleshooting-issue-carousel'),
      'layout',
      {
        nativeEvent: { layout: { width: 360, height: 200, x: 0, y: 0 } },
      },
    );

    expect(screen.getByText('Step counting stopped')).toBeOnTheScreen();
    expect(screen.getByText('Switched to Health Connect')).toBeOnTheScreen();
    expect(screen.getByText('Health sync failed')).toBeOnTheScreen();

    const pedometerCard = screen.getByTestId(
      'troubleshooting-issue-card-pedometer',
    );
    expect(StyleSheet.flatten(pedometerCard.props.style).width).toBe(304);
    expect(
      screen.getByTestId('troubleshooting-issue-pager').props.snapToInterval,
    ).toBe(320);

    const noticeCard = screen.getByTestId('troubleshooting-issue-card-notice');
    await userEvent
      .setup()
      .press(within(noticeCard).getByLabelText('Dismiss sync error'));

    expect(
      useProgressStore
        .getState()
        .troubleshootingIssues.find(
          issue => issue.error.kind === 'sourceFallback',
        ),
    ).toMatchObject({ dismissedAt: expect.any(Number) });
    expect(
      useProgressStore
        .getState()
        .troubleshootingIssues.find(
          issue => issue.error.kind === 'pedometerServiceStopped',
        ),
    ).toMatchObject({ dismissedAt: null });
  });
});
