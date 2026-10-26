import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import {
  StyleSheet,
  View,
  StatusBar,
  AppState,
  Text,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';

import MapScreen from './src/screens/MapScreen';
import WelcomeModal from './src/screens/WelcomeModal';
import SharedModal from './src/screens/SharedModal';
import Button from './src/components/Buttons';
import { useSettingsStore, useTheme } from './src/stores/settingsStore';
import { useSyncInterval } from './src/hooks/useSyncInterval';
import { useFriendProgressSync } from './src/hooks/useFriendProgressSync';
import { useLivePedometerDeltaOwner } from './src/hooks/useLivePedometerDelta';

import { useInitializationStore } from './src/stores/initializationStore';
import { database } from './src/services/database';
import { useProgressStore } from './src/stores/progressStore';
import {
  setupDevMockLongSyncIfEnabled,
  shouldForceUpgradeSplashForDev,
  shouldForceTestSyncErrorForDev,
  addTestSyncErrorForDev,
} from './src/services/devSyncMock';
import { ensureTrackingModeRunning } from './src/services/trackingModeService';
import { initializeFirebaseAppCheck } from './src/services/firebaseAppCheck';
import { typographyThemed } from './src/styles/typography';
import { spacing } from './src/styles/global';
import { pickRandomLoadingPhrase } from './src/constants/loadingPhrases';

const Stack = createStackNavigator();
const MAP_READY_TIMEOUT_MS = 1500;

type BootstrapStatus = 'loading' | 'ready' | 'error';

export function getSplashStatus({
  bootstrapStatus,
  mapReady,
  mapReadyTimedOut,
  showWelcome,
  welcomeReady,
}: {
  bootstrapStatus: BootstrapStatus;
  mapReady: boolean;
  mapReadyTimedOut: boolean;
  showWelcome: boolean;
  welcomeReady: boolean;
}): BootstrapStatus {
  if (bootstrapStatus === 'error') return 'error';
  const nextScreenReady = !showWelcome || welcomeReady;
  if (
    bootstrapStatus === 'ready' &&
    nextScreenReady &&
    (mapReady || mapReadyTimedOut)
  ) {
    return 'ready';
  }
  return 'loading';
}

export function shouldShowWelcomeModal({
  bootstrapStatus,
  showWelcome,
}: {
  bootstrapStatus: BootstrapStatus;
  showWelcome: boolean;
}): boolean {
  return bootstrapStatus !== 'error' && showWelcome;
}

export async function runRecoverableBootstrapStep(
  name: string,
  operation: () => void | Promise<void>,
): Promise<void> {
  const start = Date.now();
  try {
    await operation();
  } catch (error) {
    console.warn(
      `[App] initApp: ${name} failed in ${Date.now() - start}ms:`,
      error,
    );
  }
}

async function runRequiredBootstrapStep<T>(
  name: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    return await operation();
  } catch (error) {
    console.error(
      `[App] initApp: ${name} failed in ${Date.now() - start}ms:`,
      error,
    );
    throw error;
  }
}

// Minimum time (ms) the spinner/label must stay visible once shown, so a
// fast bootstrap (nothing to migrate, warm cache) can't fade the splash
// away before the user has had a chance to read the loading phrase.
const MIN_VISIBLE_MS = 1000;

function minVisibleRemainingMs(spinnerShownAt: number | null): number {
  if (spinnerShownAt === null) return 0;
  return Math.max(0, MIN_VISIBLE_MS - (Date.now() - spinnerShownAt));
}

// Splash overlay - root level, fades out only after successful hydration
export function SplashOverlay({
  status,
  label = 'Loading',
  onHidden,
  onRetry,
  errorTitle = 'Unable to load data',
  errorMessage = 'Your saved journey has not been changed. Try loading it again.',
}: {
  status: BootstrapStatus;
  // Shown above the spinner once it appears. Defaults to "Loading" for
  // every ordinary launch; App.tsx passes "Upgrading" instead when this
  // launch's database.init() detected a protected schema upgrade (see
  // database.ts's `wasProtectedUpgrade` and isLegacyUpgradeMissingSchemaMeta
  // for exactly which launches that covers) — so a real user migrating
  // from a legacy version sees confirmation that the longer first-run
  // pause (how ever brief) is a deliberate one-time upgrade step, not the
  // app looking stuck or broken.
  label?: string;
  onHidden?: () => void;
  /**
   * Called when the user presses Retry on the `status === 'error'` view
   * rendered by this component (see that render branch below). Required
   * for that view to be actionable — App.tsx wires this to
   * `setBootstrapAttempt(attempt => attempt + 1)`, which re-runs the
   * whole bootstrap effect from scratch.
   */
  onRetry?: () => void;
  /** Overrides the error view's title. See App.tsx's `upgradeMigrationFailed`
   * for when this is set to upgrade-specific copy instead of the default. */
  errorTitle?: string;
  /** Overrides the error view's body message. */
  errorMessage?: string;
}) {
  const theme = useTheme();
  const [faded, setFaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  // Opacity is driven by react-native-reanimated (a UI-thread shared value),
  // not the legacy `Animated` API. The legacy API's useNativeDriver mode
  // dispatches imperative opacity commands (setValue/timing) across the
  // async JS<->UI bridge queue; under a severe main-thread jank spike (we
  // confirmed via logcat "Skipped 59 frames! The application may be doing
  // too much work on its main thread" occurring at exactly this moment —
  // right as WelcomeModal/MapScreen settle in alongside the splash's own
  // fade), those commands can apply out of order. We root-caused a real,
  // reproducible bug this way: frame-by-frame screen recordings showed the
  // fade-out genuinely completing (full map visible), then — ~12ms later,
  // with ZERO corresponding React re-render or remount in the JS logs —
  // the opaque "Loading"/"Upgrading" splash (with its spinner still
  // visibly, continuously rotating, proving it was a live native view, not
  // a cached/stale compositor buffer) reappeared for ~80-100ms before
  // snapping back to the map. That matches a late-arriving, out-of-order
  // "opacity back to 1" bridge command racing the already-applied
  // "opacity to 0" command. Reanimated's shared values run the animation
  // and its final-value application entirely on the UI thread via
  // worklets, without that separate async command queue, which avoids
  // this class of ordering hazard. (Two earlier fixes were tried and
  // disproven before finding this: delaying the unmount after fade-finish
  // by 150ms, and pinning the view to its own hardware layer via
  // renderToHardwareTextureAndroid — neither changed the symptom at all,
  // which is what pointed away from "stale GPU buffer on
  // unmount/compositing" and toward "stale bridge command", since the
  // flash occurred well before unmount and with the spinner still live.)
  const opacity = useSharedValue(1);
  const animatedSplashStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  // Timestamp of when the spinner/label actually became visible (see the
  // 200ms spinnerTimer below) — used to enforce MIN_VISIBLE_MS so a fast
  // bootstrap (e.g. nothing to migrate, warm cache) can't fade the splash
  // out again before the user has had a chance to read the loading phrase.
  const spinnerShownAtRef = useRef<number | null>(null);

  useEffect(() => {
    cancelAnimation(opacity);

    if (status === 'loading') {
      setFaded(false);
      setShowSpinner(false);
      opacity.value = 1;
      spinnerShownAtRef.current = null;
      const spinnerTimer = setTimeout(() => {
        setShowSpinner(true);
        spinnerShownAtRef.current = Date.now();
      }, 200);
      return () => clearTimeout(spinnerTimer);
    }

    if (status === 'error') {
      // Previously this immediately faded the splash to transparent and
      // called onHidden(), on the assumption a separate, App-root-level
      // error screen (outside this component, outside WelcomeModal's
      // Modal) would be revealed underneath once this view got out of
      // the way. That assumption broke on Android whenever WelcomeModal
      // had already mounted earlier this session: WelcomeModal renders
      // through a native <Modal>, which Android always composites in its
      // own top-level OS window, ABOVE everything else in the main
      // Activity — including that separate error View — regardless of
      // JSX order. Confirmed directly: forcing a migration failure after
      // the welcome modal had mounted showed the welcome screen with no
      // visible error at all; the error view was rendering, just
      // entirely hidden behind the modal's window. Rendering the error
      // UI directly inside THIS component (see the `status === 'error'`
      // branch in the JSX below) fixes it for both call sites — the one
      // rendered via WelcomeModal's own `startupOverlay` prop now shares
      // the same Modal window as the content it needs to cover, and the
      // plain fallback usage was never affected either way. So: stay
      // fully visible (not faded) and do NOT call onHidden — this view
      // now owns showing the error state itself, rather than handing off
      // to something else that may not actually be visible.
      opacity.value = 1;
      setFaded(false);
      return;
    }

    opacity.value = withDelay(
      200 + minVisibleRemainingMs(spinnerShownAtRef.current),
      withTiming(0, { duration: 400 }, finished => {
        if (finished) {
          // NOTE: deliberately not calling runOnJS(console.log)(...) here.
          // This worklet runs on the UI thread; an earlier version of this
          // debug instrumentation called runOnJS(console.log)(...) with an
          // object literal built from values captured by this closure, and
          // that caused a real native crash (SIGABRT) confirmed via
          // tombstone: "facebook::jsi::Function::getHostFunction(...):
          // assertion isHostFunction(runtime) failed" inside
          // libworklets.so. The `faded` effect below logs the equivalent
          // info safely from the JS thread instead.
          runOnJS(setFaded)(true);
          if (onHidden) {
            runOnJS(onHidden)();
          }
        }
      }),
    );

    return () => {
      cancelAnimation(opacity);
    };
  }, [status, opacity, onHidden, label]);

  return (
    <Animated.View
      pointerEvents={faded ? 'none' : 'auto'}
      testID="splash-overlay"
      style={[
        StyleSheet.absoluteFillObject,
        styles.splashFill,
        { backgroundColor: theme.colors.splashBackground },
        animatedSplashStyle,
      ]}
    >
      {status === 'error' ? (
        <View style={styles.splashErrorContent} accessibilityRole="alert">
          <Text
            style={[
              typographyThemed(theme).subtitleLargeInverted,
              styles.splashErrorTitle,
            ]}
          >
            {errorTitle}
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionInverted,
              styles.splashErrorMessage,
            ]}
          >
            {errorMessage}
          </Text>
          <Button
            onPress={() => onRetry?.()}
            variant="primaryInverted"
            accessibilityLabel="Retry initialization"
          >
            Retry
          </Button>
        </View>
      ) : (
        showSpinner &&
        !faded && (
          <>
            <Text
              style={[
                typographyThemed(theme).subtitleLargeInverted,
                styles.splashLabel,
              ]}
            >
              {label}
            </Text>
            <ActivityIndicator
              accessibilityLabel="Loading saved journey"
              color={theme.colors.iconInverted}
              size="large"
            />
          </>
        )
      )}
    </Animated.View>
  );
}

function App(): React.JSX.Element {
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapReadyTimedOut, setMapReadyTimedOut] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [welcomeReady, setWelcomeReady] = useState(false);
  // True only while this launch is running a protected schema upgrade —
  // see database.ts's `wasProtectedUpgrade` for the exact detection,
  // which covers both a normal version-behind upgrade and a legacy
  // pre-schema_meta database's very first migration. Drives the splash
  // screen's "Upgrading"/"Loading" label — see SplashOverlay below.
  const [isUpgrading, setIsUpgrading] = useState(false);
  // True only when THIS bootstrap attempt's database.init() call itself
  // rejected while running a protected schema upgrade (checked via
  // database.wasProtectedUpgradeAttempt() right after catching the
  // rejection — see that method's docstring for why it's reliable even
  // though init()'s own return value is unavailable on a rejected call).
  // Deliberately scoped to ONLY the database.init() step, not loadSettings
  // or initFromDatabase failing afterward — those are unrelated to
  // migration even on a launch that happened to also be an upgrade, and
  // showing "upgrade failed" copy for an unrelated failure would be
  // misleading. Drives upgrade-specific copy on the bootstrap error
  // screen instead of the generic message — see its usage below.
  const [upgradeMigrationFailed, setUpgradeMigrationFailed] = useState(false);
  // Picked once per app mount (lazy initializer) so the phrase stays
  // stable across re-renders of this component but varies launch to
  // launch. Only used for the ordinary "Loading" splash state — the
  // "Upgrading" state always keeps its literal copy (see label prop below).
  const [loadingPhrase] = useState(() => pickRandomLoadingPhrase());
  // Keeps <WelcomeModal> mounted through its own exit-fade animation.
  // Gating its presence purely on `showWelcome` unmounted it the instant
  // dismissal happened, before its internal fade-out could run at all —
  // this is what made welcome-dismiss look like an instant cut instead of
  // a smooth fade revealing the map underneath. Flips true whenever
  // welcome should show; only flips back false once WelcomeModal itself
  // reports (via onExited) that its exit animation has actually finished.
  const [welcomeModalMounted, setWelcomeModalMounted] = useState(false);
  const setPhase = useInitializationStore(state => state.setPhase);

  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  const loadSettings = useSettingsStore(state => state.loadSettings);

  // Set up periodic sync when health sync is enabled
  useSyncInterval();
  useFriendProgressSync();
  useLivePedometerDeltaOwner();

  const initFromDatabase = useProgressStore(state => state.initFromDatabase);

  useEffect(() => {
    let cancelled = false;

    const initApp = async () => {
      // Was the app already fully active (past onboarding, UI visible)
      // before this bootstrap effect started running? `initializationStore`
      // is Zustand/module-scope state that survives a swipe-away-in-Recents
      // resume even though this whole component tree gets torn down and
      // recreated (confirmed via logcat) — so this captures the TRUE prior
      // state, not this fresh instance's initial render value. Must be read
      // before anything below touches `phase`.
      //
      // Without this check, `setPhase('loading')` a few lines down fires on
      // every single bootstrap rerun, including a warm resume where
      // nothing actually needs to reload — MapScreen's `startupShowWelcome`
      // treats `phase === 'loading'`/`'ready'` as "hide the UI" (path and
      // buttons), so every resume forced a real (if brief) hide while
      // bootstrap re-ran, followed by a reveal once `phase` reached
      // `'active'` again a moment later — a visible hide-then-reveal
      // flash. Confirmed by testing: the flash appeared immediately after
      // fixing the original permanently-stuck bug (which this same
      // `wasAlreadyActive` check also fixes, a few lines further down),
      // and disappeared once this skip was added. A warm resume has
      // nothing to load — the whole point is the prior session's state
      // (including full UI visibility) is still valid — so it should
      // never touch `phase` at all.
      const wasAlreadyActive =
        useInitializationStore.getState().phase === 'active';
      setBootstrapStatus('loading');
      setMapReady(false);
      setMapReadyTimedOut(false);
      setSplashHidden(false);
      setWelcomeReady(false);
      setIsUpgrading(false);
      setUpgradeMigrationFailed(false);
      if (!wasAlreadyActive) {
        setPhase('loading');
      }

      await runRecoverableBootstrapStep('Firebase App Check', () =>
        initializeFirebaseAppCheck(),
      );

      // database.init() is deliberately caught on its own, separately from
      // loadSettings/initFromDatabase below: only a failure HERE can mean
      // the protected-upgrade migration itself failed (see
      // database.wasProtectedUpgradeAttempt()'s docstring), which is the
      // one bootstrap failure mode with genuinely different, more specific
      // guidance to show the user (see upgradeMigrationFailed's own
      // comment above and the bootstrap-error UI below). A failure in
      // loadSettings/initFromDatabase afterward is unrelated to migration
      // even on a launch that also happened to upgrade, so those stay on
      // the generic error path.
      let wasProtectedUpgrade: boolean;
      try {
        wasProtectedUpgrade = await runRequiredBootstrapStep(
          'database.init',
          () => database.init(),
        );
      } catch (error) {
        console.error('Failed to initialize app:', error);
        if (!cancelled) {
          if (database.wasProtectedUpgradeAttempt()) {
            setUpgradeMigrationFailed(true);
          }
          setBootstrapStatus('error');
        }
        return;
      }
      // dev-only: lets the "Upgrading" splash copy be visually reviewed
      // without needing a real legacy database seeded on the device —
      // see shouldForceUpgradeSplashForDev()'s docstring.
      if (wasProtectedUpgrade || shouldForceUpgradeSplashForDev()) {
        setIsUpgrading(true);
        // Deliberately never reset to false anywhere in this file (unlike
        // isUpgrading above, which intentionally resets every bootstrap
        // attempt so the splash label reflects only the CURRENT attempt).
        // This powers a separate, longer-lived confirmation message on
        // the welcome screen — see initializationStore's own doc comment
        // on wasJustUpgraded for why it should persist for the rest of
        // this app session (not just the current bootstrap attempt) and
        // why module-scoped/in-memory (not persisted to disk) is the
        // right lifetime for it.
        useInitializationStore.getState().setWasJustUpgraded(true);
      }

      try {
        await runRequiredBootstrapStep('loadSettings', () => loadSettings());
        // Initialize progress store from database (single source of truth)
        await runRequiredBootstrapStep('initFromDatabase', () =>
          initFromDatabase(),
        );
      } catch (error) {
        console.error('Failed to initialize app:', error);
        if (!cancelled) {
          setBootstrapStatus('error');
        }
        return;
      }

      // These services can be repaired or retried after the user's saved
      // state is safe to render, so they must not turn hydration into a
      // blocking startup failure.
      await runRecoverableBootstrapStep('dev mock setup', () =>
        setupDevMockLongSyncIfEnabled(),
      );
      // dev-only: lets the welcome screen's "Upgrade complete" card be
      // visually reviewed alongside a real troubleshooting issue card at
      // the same time — see shouldForceTestSyncErrorForDev()'s docstring.
      if (shouldForceTestSyncErrorForDev()) {
        addTestSyncErrorForDev();
      }
      await runRecoverableBootstrapStep('tracking mode', () =>
        ensureTrackingModeRunning(),
      );

      if (!cancelled) {
        // ROOT CAUSE FIX for the blank-UI-on-resume bug: this used to
        // unconditionally setPhase('ready') here, every single time
        // initApp() runs — including when it reruns because Android
        // recreated the whole React root after the app was swiped away
        // in Recents and reopened (confirmed via logcat: same PID, but a
        // fresh `Running "MiddleEarthChallenge"` root + full `initApp`
        // rerun). `phase === 'ready'` is documented as "welcome screen
        // visible", and it is ONLY ever promoted onward to 'revealing'
        // then 'active' by WelcomeModal's `onDismiss` handler — which
        // only ever fires while `showWelcome` is true. For a returning
        // user `showWelcome` is already persisted false (onboarding was
        // completed long ago, in a previous app session), so
        // WelcomeModal never mounts again and `onDismiss` never fires
        // again — meaning `phase` got permanently stuck at 'ready'
        // forever after any bootstrap rerun, with no code path left to
        // ever advance it. Confirmed directly via on-device logging:
        // after a resume, `useInitialAnimation`'s hide-everything
        // else-branch (gated on `phase === 'ready'`) ran on every
        // render, forever, while its reveal branch never ran again even
        // once — exactly matching the reported symptom (path/buttons
        // permanently invisible, only after swipe-away-resume, never
        // after a plain Home-button background/foreground cycle that
        // doesn't rerun this effect at all).
        //
        // Guarded on `!wasAlreadyActive` for the same reason as the
        // `setPhase('loading')` skip above: a warm resume's phase is
        // already 'active' and was never touched, so there's nothing to
        // restore here — doing so anyway would be a harmless no-op at
        // best, but reading `showWelcome` fresh here could theoretically
        // race with a real same-tick settings change; simplest and
        // safest is to leave an already-active resume alone entirely.
        //
        // Reading the store directly here (not the captured `showWelcome`
        // hook value from this closure) because `loadSettings()` above
        // may have just hydrated it from the database — this needs the
        // authoritative post-hydration value, not whatever was true when
        // this effect last happened to be defined.
        if (!wasAlreadyActive) {
          const alreadyOnboarded = !useSettingsStore.getState().showWelcome;
          setPhase(alreadyOnboarded ? 'active' : 'ready');
        }
        setBootstrapStatus('ready');
      }
    };

    initApp();
    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt, loadSettings, initFromDatabase, setPhase]);

  useEffect(() => {
    if (bootstrapStatus !== 'ready' || mapReady) return;

    const timer = setTimeout(() => {
      console.warn('[App] Map visual readiness timed out');
      setMapReadyTimedOut(true);
    }, MAP_READY_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [bootstrapStatus, mapReady]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const handleSplashHidden = useCallback(() => {
    setSplashHidden(true);
  }, []);

  const handleWelcomeReady = useCallback(() => {
    setWelcomeReady(true);
  }, []);

  const handleWelcomeExited = useCallback(() => {
    setWelcomeModalMounted(false);
  }, []);

  const splashStatus = getSplashStatus({
    bootstrapStatus,
    mapReady,
    mapReadyTimedOut,
    showWelcome,
    welcomeReady,
  });

  // Single source of truth for the splash/error overlay element — created
  // ONCE here, then placed into exactly one of two JSX slots below
  // depending on whether WelcomeModal is currently mounted (never both,
  // and never neither while this is non-null). There must only ever be
  // one <SplashOverlay> actually rendered into the tree at a time: on
  // Android, WelcomeModal renders through a native <Modal>, which always
  // composites in its own top-level OS window above everything else in
  // the main Activity, regardless of JSX order or elements underneath it.
  // That means whenever WelcomeModal is mounted, the splash/error overlay
  // MUST be nested inside it (via its `startupOverlay` prop) to actually
  // be visible on top of its content — rendering a second, separate
  // instance as a plain sibling elsewhere in the tree would just render
  // invisibly behind WelcomeModal's window (confirmed: this was exactly
  // how the bootstrap error screen went completely invisible once
  // WelcomeModal had mounted, before this was fixed). Conversely, once
  // WelcomeModal is NOT mounted (a returning user who dismissed welcome
  // forever, so `showWelcome` is persisted false), there is no Modal
  // window for anything to hide behind, so the same element can — and
  // must — render directly as a standalone sibling instead, or nothing
  // would cover the loading/error state for that user at all.
  const splashOverlayElement = splashHidden ? null : (
    <SplashOverlay
      status={splashStatus}
      label={isUpgrading ? 'Upgrading' : loadingPhrase}
      onHidden={handleSplashHidden}
      onRetry={() => setBootstrapAttempt(attempt => attempt + 1)}
      errorTitle={
        upgradeMigrationFailed ? 'Upgrade could not finish' : undefined
      }
      errorMessage={
        upgradeMigrationFailed
          ? // Deliberately does NOT claim "nothing has changed": a
            // migration failure can leave the database partway between
            // schemas (see database.ts's migrateWithSnapshotProtection —
            // it reverts and retries once automatically, but a second
            // failure is not reverted again). What IS always true, in
            // every case, is that no existing recorded data is ever
            // deleted by any step of the migration (it is exclusively
            // ALTER TABLE ADD COLUMN plus one read-only aggregate
            // query) — so this promises only that, which is both
            // accurate and genuinely the thing a worried user needs
            // reassurance about. Retry is worth offering here, not just
            // a dead end: most of the migration's individual steps
            // already skip columns a previous attempt successfully
            // added (see isDuplicateColumnError's usage throughout
            // runSchemaMigrations), so a retry after a transient failure
            // (or one that got partway through) has a real chance of
            // completing rather than just repeating the exact same
            // failure.
            'We hit a problem finishing your upgrade. Your recorded miles, steps, and history are safe. Try again below.'
          : undefined
      }
    />
  );

  // Keep <WelcomeModal> mounted for as long as it should be showing, OR
  // the splash/error overlay still needs somewhere to render (see
  // splashOverlayElement's own comment above for why: WelcomeModal is the
  // ONLY place that overlay can ever actually be visible on Android,
  // since its native Modal window always sits above everything else in
  // the main Activity). The `!splashHidden` half of this condition is
  // what makes WelcomeModal mount even when `showWelcome` happens to be
  // false at that moment (e.g. a same-session resume after Welcome was
  // already dismissed once) — its own `visible={showWelcome}` prop still
  // correctly keeps the actual Welcome content hidden in that case; only
  // the overlay (nested via startupOverlay) shows. This used to require
  // a second, separate <SplashOverlay> rendered directly as a sibling
  // for exactly that case — removed, since it could never actually be
  // seen once WelcomeModal was ALSO mounted (same single-top-window
  // Android constraint), and was otherwise just dead/invisible JSX.
  // Also keeps playing WelcomeModal's own exit animation once mounted;
  // this only ever needs to flip TRUE here — it flips back false via
  // handleWelcomeExited, once WelcomeModal itself confirms the fade-out
  // has actually finished.
  useEffect(() => {
    if (
      shouldShowWelcomeModal({ bootstrapStatus, showWelcome }) ||
      !splashHidden
    ) {
      setWelcomeModalMounted(true);
    }
  }, [bootstrapStatus, showWelcome, splashHidden]);

  // Re-reconcile tracking-mode state whenever the app returns to the
  // foreground. Catches: user granted/revoked ACTIVITY_RECOGNITION in
  // system Settings, the OS killed our foreground service, or the
  // persisted native-cleanup request still needs to finish (see
  // ensureTrackingModeRunning docstring for the recovery cases).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && bootstrapStatus === 'ready') {
        ensureTrackingModeRunning().catch(err =>
          console.warn('[App] tracking-mode reconcile on resume failed:', err),
        );
      }
    });
    return () => sub.remove();
  }, [bootstrapStatus]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />
      <View style={styles.container}>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Map">
              {() => (
                <MapScreen
                  mapReadyEnabled={bootstrapStatus === 'ready'}
                  mapReadyToken={bootstrapAttempt}
                  onMapReady={handleMapReady}
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>

        {/* Global Modals */}
        {welcomeModalMounted && (
          <WelcomeModal
            visible={showWelcome}
            onReady={handleWelcomeReady}
            onExited={handleWelcomeExited}
            // This is the ONLY place the splash/error overlay element is
            // ever rendered — see splashOverlayElement's own comment
            // above (where it's computed once) for why there must never
            // be a second copy rendered elsewhere as a sibling: Android
            // always composites WelcomeModal's native Modal window above
            // everything else in the main Activity, so anything meant to
            // visually sit on top of it must render inside it via this
            // prop, or it is simply invisible, hidden behind the modal.
            startupOverlay={splashOverlayElement}
            onDismiss={() => {
              setShowWelcome(false);
              // Transition to revealing phase when welcome is dismissed
              setPhase('revealing');
            }}
          />
        )}

        {/* SharedModal - stack-based modal navigation */}
        <SharedModal />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splashFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLabel: {
    marginBottom: spacing.md,
  },
  splashErrorContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  splashErrorTitle: {
    textAlign: 'center',
  },
  splashErrorMessage: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
});

export default App;
