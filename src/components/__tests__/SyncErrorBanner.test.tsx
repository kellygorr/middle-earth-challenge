import React from 'react';
import {
  fireEvent,
  render,
  screen,
  userEvent,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import SyncErrorBanner from '../SyncErrorBanner';
import { useProgressStore, type SyncIssue } from '../../stores/progressStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';

const stoppedIssue: SyncIssue = {
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

const fallbackIssue: SyncIssue = {
  error: {
    kind: 'sourceFallback',
    unavailableSource: 'pedometer',
    activeSource: 'health-app',
  },
  at: stoppedIssue.at,
  dismissedAt: null,
  resolvedAt: null,
};

const backgroundIssue: SyncIssue = {
  error: { kind: 'backgroundDisabled' },
  at: stoppedIssue.at,
  dismissedAt: null,
  resolvedAt: null,
};

describe('SyncErrorBanner', () => {
  beforeEach(() => {
    useProgressStore.setState({ syncIssues: [] });
    useSettingsStore.setState({ useMiles: true });
    useUIStore.setState({ modalStack: [] });
  });

  it('renders stopped-service recovery guidance and both actions', async () => {
    const user = userEvent.setup();
    useProgressStore.setState({ syncIssues: [stoppedIssue] });

    await render(<SyncErrorBanner />);

    expect(screen.getByText('Step counting stopped')).toBeOnTheScreen();
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
      { type: 'miles' },
    ]);
  });

  it('uses the selected distance unit for catch-up entry', async () => {
    useProgressStore.setState({ syncIssues: [stoppedIssue] });
    useSettingsStore.setState({ useMiles: false });

    await render(<SyncErrorBanner />);

    expect(screen.getByText('Add catch-up kilometers')).toBeOnTheScreen();
    expect(screen.getByLabelText('Add kilometers')).toBeOnTheScreen();
  });

  it('sizes and snaps multiple cards while dismissing only the chosen slot', async () => {
    useProgressStore.setState({
      syncIssues: [stoppedIssue, fallbackIssue, backgroundIssue],
    });

    await render(<SyncErrorBanner bleed={24} />);
    await fireEvent(screen.getByTestId('sync-issue-carousel'), 'layout', {
      nativeEvent: { layout: { width: 360, height: 200, x: 0, y: 0 } },
    });

    expect(screen.getByText('Step counting stopped')).toBeOnTheScreen();
    expect(screen.getByText('Switched to Health Connect')).toBeOnTheScreen();
    expect(screen.getByText('Background updates are off')).toBeOnTheScreen();

    const pedometerCard = screen.getByTestId('sync-issue-card-pedometer');
    expect(StyleSheet.flatten(pedometerCard.props.style).width).toBe(304);
    expect(screen.getByTestId('sync-issue-pager').props.snapToInterval).toBe(
      320,
    );

    const noticeCard = screen.getByTestId('sync-issue-card-notice');
    await userEvent
      .setup()
      .press(within(noticeCard).getByLabelText('Dismiss sync error'));

    expect(
      useProgressStore
        .getState()
        .syncIssues.find(issue => issue.error.kind === 'sourceFallback'),
    ).toMatchObject({ dismissedAt: expect.any(Number) });
    expect(
      useProgressStore
        .getState()
        .syncIssues.find(
          issue => issue.error.kind === 'pedometerServiceStopped',
        ),
    ).toMatchObject({ dismissedAt: null });
  });
});
