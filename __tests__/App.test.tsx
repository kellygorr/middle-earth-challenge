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
import { withTiming } from 'react-native-reanimated';
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
  jest.spyOn(database, 'init').mockResolvedValue(false);
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

  // showWelcome is false in the default fixture (beforeEach) — an
  // already-onboarded returning user. Bootstrap should land directly on
  // 'active', not the transient 'ready' plateau (which is reserved for
  // "welcome screen visible"). See the matching App.tsx comment: landing
  // on 'ready' here used to be asserted as correct, but it was actually
  // the exact deadlocked state that caused the blank-UI-on-resume bug —
  // 'ready' can only ever be promoted onward by WelcomeModal's onDismiss,
  // which never fires once showWelcome is already false, so a returning
  // user bootstrapping straight to 'ready' had no way to ever reach
  // 'active' again.
  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('active'),
  );
  expect(screen.getByText('Labels')).toBeOnTheScreen();
  expect(screen.getByLabelText('View statistics')).toBeOnTheScreen();
  expect(screen.getByLabelText('Open settings')).toBeOnTheScreen();
  expect(screen.getByLabelText('Recenter map')).toBeOnTheScreen();
  expect(screen.getByLabelText('Add distance')).toBeOnTheScreen();
  expect(consoleError).not.toHaveBeenCalled();
});

test('shows "Loading" on an ordinary launch', async () => {
  const settingsReady = deferred();
  loadSettings.mockReturnValue(settingsReady.promise);
  jest.spyOn(database, 'init').mockResolvedValue(false);
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  await render(<App />);

  // Splash must still be up (settingsReady unresolved) for the spinner's
  // 200ms-delay timer to have fired and the label to actually be mounted —
  // matching the existing "keeps the splash..." test's wait pattern. The
  // visible text is a randomly-picked Middle Earth loading phrase (see
  // pickRandomLoadingPhrase), so assert via the stable accessibility label
  // instead of literal "Loading" text.
  await waitFor(() => expect(loadSettings).toHaveBeenCalledTimes(1));
  expect(
    await screen.findByLabelText('Loading saved journey'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Upgrading')).not.toBeOnTheScreen();

  await act(async () => settingsReady.resolve());
  expect(consoleError).not.toHaveBeenCalled();
});

test('shows "Upgrading" instead of "Loading" when database.init() reports a protected schema upgrade', async () => {
  const settingsReady = deferred();
  loadSettings.mockReturnValue(settingsReady.promise);
  // true = this launch ran a protected upgrade (either a normal
  // version-behind upgrade, or — the case this feature exists for — a
  // real legacy pre-schema_meta database's very first migration).
  jest.spyOn(database, 'init').mockResolvedValue(true);
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  await render(<App />);

  await waitFor(() => expect(loadSettings).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Upgrading')).toBeOnTheScreen();
  expect(screen.queryByText('Loading')).not.toBeOnTheScreen();

  await act(async () => settingsReady.resolve());
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
  // Same reasoning as 'renders the map controls': showWelcome is false
  // in this fixture, so bootstrap completing lands directly on 'active',
  // not 'ready'.
  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('active'),
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

test('first-time users (showWelcome true) still land on ready, not active, so the welcome flow runs', async () => {
  useSettingsStore.setState({ showWelcome: true });
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  await render(<App />);

  // Unlike a returning user, a first-time user must stop at 'ready' and
  // wait for WelcomeModal's onDismiss to advance the phase — there is no
  // prior onboarding to skip.
  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('ready'),
  );
  expect(useInitializationStore.getState().phase).not.toBe('active');
  expect(consoleError).not.toHaveBeenCalled();
});

test('regression: bootstrap rerunning after a resume reaches active again instead of getting stuck at ready', async () => {
  // Reproduces the exact blank-UI-on-resume bug: confirmed via on-device
  // logcat that swiping the app away in Recents and reopening it does
  // NOT kill the process, but DOES recreate the whole React root and
  // rerun this component's bootstrap effect from scratch — while
  // Zustand's module-scope stores (including initializationStore and
  // settingsStore) survive untouched, since they live outside React.
  // Mounting a second <App/> instance against an initializationStore
  // already sitting at 'active' (as it would be right before a resume)
  // and an unchanged, already-onboarded settingsStore faithfully
  // reproduces that exact situation without needing an actual Activity
  // recreation.
  //
  // Before the fix, this got permanently stuck at 'ready': bootstrap
  // unconditionally called setPhase('ready'), and nothing ever promotes
  // phase onward again for a returning user (showWelcome already false
  // means WelcomeModal never mounts, so its onDismiss — the only other
  // place that advances phase — never fires a second time).
  useInitializationStore.setState({ phase: 'active' });
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  await render(<App />);

  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('active'),
  );
  expect(consoleError).not.toHaveBeenCalled();
});

test('shows bootstrap failure and reaches readiness only after retry succeeds', async () => {
  const failure = new Error('database unavailable');
  jest
    .spyOn(database, 'init')
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(false);
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
  // Same reasoning as 'renders the map controls': showWelcome is false
  // in this fixture, so retry succeeding lands directly on 'active'.
  await waitFor(() =>
    expect(useInitializationStore.getState().phase).toBe('active'),
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
  // The overlay stays mounted AND interactive on error (unlike a genuine
  // fade-out): it now renders its own error title/message/Retry button
  // directly (see SplashOverlay's `status === 'error'` branch) rather
  // than fading away to reveal a separate error screen elsewhere — that
  // separate screen used to exist as a plain sibling View, but on
  // Android it could end up invisible, hidden behind WelcomeModal's own
  // native Modal window once WelcomeModal had mounted (Android always
  // composites a Modal's window above everything else in the Activity,
  // regardless of JSX order). Rendering the error UI inside this
  // same component — which is already nested inside WelcomeModal's
  // `startupOverlay` prop specifically so it shares that Modal's window
  // — fixes that for good.
  expect(
    renderer!.root.findByProps({ testID: 'splash-overlay' }).props
      .pointerEvents,
  ).toBe('auto');
  expect(
    renderer!.root.findAllByType(ActivityIndicator),
  ).toHaveLength(0);
  expect(renderer!.root.findByProps({ children: 'Retry' })).toBeTruthy();

  // The default global reanimated jest mock (jest.setup.js) does not
  // invoke withTiming's completion callback — it only returns toValue,
  // matching real reanimated's synchronous-looking API shape but not its
  // actual async completion behavior. Override it before the status
  // change that triggers the real fade-out effect below, so the
  // 200ms-delay + 400ms-fade completion callback (which flips `faded`
  // true, the thing being asserted below) actually fires — same pattern
  // already used in useInitialAnimation.test.ts's 'does not run the
  // fallback after normal animation completion' test. Restored after
  // this test so it doesn't leak into unrelated tests.
  (withTiming as jest.Mock).mockImplementation(
    (toValue, _config, callback) => {
      callback?.(true);
      return toValue;
    },
  );

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
  (withTiming as jest.Mock).mockImplementation(toValue => toValue);
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
