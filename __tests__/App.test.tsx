/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import App, {
  getSplashStatus,
  runRecoverableBootstrapStep,
  shouldShowWelcomeModal,
  SplashOverlay,
} from '../App';
import { database } from '../src/services/database';
import { useInitializationStore } from '../src/stores/initializationStore';
import { useProgressStore } from '../src/stores/progressStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import * as trackingModeService from '../src/services/trackingModeService';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

let loadSettings: jest.Mock;
let initFromDatabase: jest.Mock;

beforeEach(() => {
  loadSettings = jest.fn().mockResolvedValue(undefined);
  initFromDatabase = jest.fn().mockResolvedValue(undefined);
  useSettingsStore.setState({
    showWelcome: false,
    syncEnabled: false,
    sharingEnabled: false,
    trackingMode: 'health-app',
    loadSettings,
  });
  useProgressStore.setState({ initFromDatabase });
  useInitializationStore.setState({ phase: 'loading' });
  jest.spyOn(database, 'init').mockResolvedValue(undefined);
  jest
    .spyOn(trackingModeService, 'ensureTrackingModeRunning')
    .mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders the map controls', async () => {
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});
  await render(<App />);

  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('ready'),
  );
  expect(screen.getByText('Labels')).toBeOnTheScreen();
  expect(screen.getByLabelText('View statistics')).toBeOnTheScreen();
  expect(screen.getByLabelText('Open settings')).toBeOnTheScreen();
  expect(screen.getByLabelText('Recenter map')).toBeOnTheScreen();
  expect(screen.getByLabelText('Add distance')).toBeOnTheScreen();
  expect(consoleError).not.toHaveBeenCalled();
});

test('keeps the splash until required bootstrap steps complete', async () => {
  const settingsReady = deferred();
  const progressReady = deferred();
  const trackingReady = deferred();
  loadSettings.mockReturnValue(settingsReady.promise);
  initFromDatabase.mockReturnValue(progressReady.promise);
  jest
    .spyOn(trackingModeService, 'ensureTrackingModeRunning')
    .mockReturnValue(trackingReady.promise);
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  await render(<App />);
  await waitFor(() => expect(loadSettings).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('splash-overlay')).toBeOnTheScreen();

  await act(async () => settingsReady.resolve());
  await waitFor(() => expect(initFromDatabase).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('splash-overlay')).toBeOnTheScreen();

  await act(async () => progressReady.resolve());
  await waitFor(() =>
    expect(trackingModeService.ensureTrackingModeRunning).toHaveBeenCalledTimes(
      1,
    ),
  );
  expect(screen.getByTestId('splash-overlay')).toBeOnTheScreen();
  expect(useInitializationStore.getState().phase).toBe('loading');

  await act(async () => trackingReady.resolve());
  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('ready'),
  );
  expect(consoleError).not.toHaveBeenCalled();
});

test('allows splash to hide after map readiness or its timeout fallback', () => {
  expect(
    getSplashStatus({
      bootstrapStatus: 'ready',
      mapReady: false,
      mapReadyTimedOut: false,
      showWelcome: false,
      welcomeReady: false,
    }),
  ).toBe('loading');
  expect(
    getSplashStatus({
      bootstrapStatus: 'ready',
      mapReady: true,
      mapReadyTimedOut: false,
      showWelcome: false,
      welcomeReady: false,
    }),
  ).toBe('ready');
  expect(
    getSplashStatus({
      bootstrapStatus: 'ready',
      mapReady: false,
      mapReadyTimedOut: true,
      showWelcome: false,
      welcomeReady: false,
    }),
  ).toBe('ready');
});

test('reports error status regardless of map or welcome readiness', () => {
  expect(
    getSplashStatus({
      bootstrapStatus: 'error',
      mapReady: true,
      mapReadyTimedOut: true,
      showWelcome: true,
      welcomeReady: true,
    }),
  ).toBe('error');
});

test('also waits for the welcome entrance animation when welcome is showing', () => {
  expect(
    getSplashStatus({
      bootstrapStatus: 'ready',
      mapReady: true,
      mapReadyTimedOut: false,
      showWelcome: true,
      welcomeReady: false,
    }),
  ).toBe('loading');
  expect(
    getSplashStatus({
      bootstrapStatus: 'ready',
      mapReady: true,
      mapReadyTimedOut: false,
      showWelcome: true,
      welcomeReady: true,
    }),
  ).toBe('ready');
});

test('shows welcome whenever bootstrap has not failed and showWelcome is set', () => {
  expect(
    shouldShowWelcomeModal({
      bootstrapStatus: 'loading',
      showWelcome: true,
    }),
  ).toBe(true);
  expect(
    shouldShowWelcomeModal({
      bootstrapStatus: 'ready',
      showWelcome: false,
    }),
  ).toBe(false);
  expect(
    shouldShowWelcomeModal({
      bootstrapStatus: 'ready',
      showWelcome: true,
    }),
  ).toBe(true);
  expect(
    shouldShowWelcomeModal({
      bootstrapStatus: 'error',
      showWelcome: true,
    }),
  ).toBe(false);
});

test('shows bootstrap failure and reaches readiness only after retry succeeds', async () => {
  const failure = new Error('database unavailable');
  jest
    .spyOn(database, 'init')
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(undefined);
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  await render(<App />);

  expect(await screen.findByText('Unable to load data')).toBeOnTheScreen();
  expect(screen.getByLabelText('Retry initialization')).toBeOnTheScreen();
  expect(screen.getByText('Labels')).toBeOnTheScreen();
  expect(useInitializationStore.getState().phase).toBe('loading');
  expect(consoleError).toHaveBeenCalledWith(
    'Failed to initialize app:',
    failure,
  );

  fireEvent.press(screen.getByLabelText('Retry initialization'));

  await waitFor(() => expect(database.init).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('ready'),
  );
  expect(screen.queryByText('Unable to load data')).not.toBeOnTheScreen();
});

test('continues bootstrap when a recoverable step fails', async () => {
  const error = new Error('service unavailable');
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  await expect(
    runRecoverableBootstrapStep('optional service', () =>
      Promise.reject(error),
    ),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringMatching(
      /^\[App\] initApp: optional service failed in \d+ms:$/,
    ),
    error,
  );

  warn.mockRestore();
});

test('shows the splash spinner only after 200ms of loading', () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SplashOverlay status="loading" />);
  });

  expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(0);

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(199);
  });
  expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(0);

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(1);

  ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});

test('fades the splash only after bootstrap is ready', () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SplashOverlay status="loading" />);
    renderer.update(<SplashOverlay status="error" />);
  });
  // The overlay stays mounted (so a retry can reset and re-fade it), but an
  // error hides it immediately: not interactive, and no spinner.
  expect(
    renderer!.root.findByProps({ testID: 'splash-overlay' }).props
      .pointerEvents,
  ).toBe('none');
  expect(
    renderer!.root.findAllByType(ActivityIndicator),
  ).toHaveLength(0);

  ReactTestRenderer.act(() => {
    renderer.update(<SplashOverlay status="loading" />);
    renderer.update(<SplashOverlay status="ready" />);
    jest.advanceTimersByTime(600);
  });
  expect(
    renderer!.root.findByProps({ testID: 'splash-overlay' }).props
      .pointerEvents,
  ).toBe('none');

  ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});

test('cancels a stale fade when loading restarts', () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SplashOverlay status="ready" />);
    jest.advanceTimersByTime(300);
    renderer.update(<SplashOverlay status="loading" />);
    jest.advanceTimersByTime(300);
  });

  // Restarting bootstrap while a fade is in flight must restore full
  // visibility and interactivity rather than leaving the overlay
  // half-faded or non-interactive from the stale animation.
  expect(
    renderer!.root.findByProps({ testID: 'splash-overlay' }).props
      .pointerEvents,
  ).toBe('auto');

  ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});
