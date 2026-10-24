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
  Animated,
  StatusBar,
  AppState,
  Pressable,
  Text,
  ActivityIndicator,
} from 'react-native';

import MapScreen from './src/screens/MapScreen';
import WelcomeModal from './src/screens/WelcomeModal';
import SharedModal from './src/screens/SharedModal';
import { useSettingsStore, useTheme } from './src/stores/settingsStore';
import { useSyncInterval } from './src/hooks/useSyncInterval';
import { useFriendProgressSync } from './src/hooks/useFriendProgressSync';
import { useLivePedometerDeltaOwner } from './src/hooks/useLivePedometerDelta';

import { useInitializationStore } from './src/stores/initializationStore';
import { database } from './src/services/database';
import { useProgressStore } from './src/stores/progressStore';
import { setupDevMockLongSyncIfEnabled } from './src/services/devSyncMock';
import { ensureTrackingModeRunning } from './src/services/trackingModeService';
import { initializeFirebaseAppCheck } from './src/services/firebaseAppCheck';

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
  console.log(`[App] initApp: ${name} start`);
  try {
    await operation();
    console.log(`[App] initApp: ${name} ready in ${Date.now() - start}ms`);
  } catch (error) {
    console.warn(
      `[App] initApp: ${name} failed in ${Date.now() - start}ms:`,
      error,
    );
  }
}

async function runRequiredBootstrapStep(
  name: string,
  operation: () => void | Promise<void>,
): Promise<void> {
  const start = Date.now();
  console.log(`[App] initApp: ${name} start`);
  try {
    await operation();
    console.log(`[App] initApp: ${name} ready in ${Date.now() - start}ms`);
  } catch (error) {
    console.error(
      `[App] initApp: ${name} failed in ${Date.now() - start}ms:`,
      error,
    );
    throw error;
  }
}

// Splash overlay - root level, fades out only after successful hydration
export function SplashOverlay({
  status,
  onHidden,
}: {
  status: BootstrapStatus;
  onHidden?: () => void;
}) {
  const theme = useTheme();
  const [faded, setFaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const activeAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    activeAnimation.current?.stop();
    activeAnimation.current = null;

    if (status === 'loading') {
      setFaded(false);
      setShowSpinner(false);
      opacity.setValue(1);
      const spinnerTimer = setTimeout(() => setShowSpinner(true), 200);
      return () => clearTimeout(spinnerTimer);
    }

    if (status === 'error') {
      opacity.setValue(0);
      setFaded(true);
      onHidden?.();
      return;
    }

    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
      delay: 200,
      useNativeDriver: true,
    });
    activeAnimation.current = animation;
    animation.start(({ finished }) => {
      if (finished) {
        setFaded(true);
        onHidden?.();
      }
    });

    return () => {
      animation.stop();
      if (activeAnimation.current === animation) {
        activeAnimation.current = null;
      }
    };
  }, [status, opacity, onHidden]);

  return (
    <Animated.View
      pointerEvents={faded ? 'none' : 'auto'}
      testID="splash-overlay"
      style={[
        StyleSheet.absoluteFillObject,
        styles.splashFill,
        { backgroundColor: theme.colors.splashBackground, opacity },
      ]}
    >
      {showSpinner && !faded && (
        <ActivityIndicator
          accessibilityLabel="Loading saved journey"
          color={theme.colors.iconInverted}
          size="large"
        />
      )}
    </Animated.View>
  );
}

function App(): React.JSX.Element {
  const theme = useTheme();
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapReadyTimedOut, setMapReadyTimedOut] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [welcomeReady, setWelcomeReady] = useState(false);
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
      console.log('[App] initApp: start');
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
      if (!wasAlreadyActive) {
        setPhase('loading');
      }

      await runRecoverableBootstrapStep('Firebase App Check', () =>
        initializeFirebaseAppCheck(),
      );

      try {
        await runRequiredBootstrapStep('database.init', () => database.init());
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

  // Keep <WelcomeModal> mounted for as long as it should be showing OR is
  // still playing its exit animation (see welcomeModalMounted's
  // declaration comment above). This only ever needs to flip TRUE here —
  // it flips back false via handleWelcomeExited, once WelcomeModal itself
  // confirms the fade-out has actually finished.
  useEffect(() => {
    if (shouldShowWelcomeModal({ bootstrapStatus, showWelcome })) {
      setWelcomeModalMounted(true);
    }
  }, [bootstrapStatus, showWelcome]);

  useEffect(() => {
    console.log('[App] splash state', {
      bootstrapStatus,
      mapReady,
      mapReadyTimedOut,
      welcomeReady,
      splashStatus,
      splashHidden,
    });
  }, [
    bootstrapStatus,
    mapReady,
    mapReadyTimedOut,
    welcomeReady,
    splashStatus,
    splashHidden,
  ]);

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
            // Only wire up the boot-time splash overlay for the genuine
            // first-boot sequence (before splash has ever finished
            // hiding). WelcomeModal can remount later in the app's
            // lifetime — e.g. every time the user returns Home from
            // Settings — and passing a non-null `startupOverlay` on
            // those later mounts replayed the whole black splash fade
            // again: SplashOverlay's internal opacity ref always starts
            // at 1 (fully opaque, solid black `splashBackground`) on
            // mount, and by the time WelcomeModal remounts here,
            // `splashStatus` is already 'ready', so its effect
            // immediately re-ran the 200ms-delay + 400ms fade from black
            // — even though splash had already legitimately finished
            // long ago. Passing undefined once splashHidden is true
            // prevents that replay, and also stops `startupOverlay !=
            // null` from unconditionally forcing WelcomeModal's own
            // underlying <Modal visible> open (see modalVisible in
            // WelcomeModal.tsx).
            startupOverlay={
              splashHidden ? undefined : (
                <SplashOverlay
                  status={splashStatus}
                  onHidden={handleSplashHidden}
                />
              )
            }
            onDismiss={() => {
              setShowWelcome(false);
              // Transition to revealing phase when welcome is dismissed
              setPhase('revealing');
            }}
          />
        )}

        {/* SharedModal - stack-based modal navigation */}
        <SharedModal />

        {bootstrapStatus === 'error' && (
          <View
            style={[
              styles.bootstrapError,
              { backgroundColor: theme.colors.splashErrorBackground },
            ]}
            accessibilityRole="alert"
          >
            <Text
              style={[
                styles.bootstrapErrorTitle,
                { color: theme.colors.splashText },
              ]}
            >
              Unable to load data
            </Text>
            <Text
              style={[
                styles.bootstrapErrorMessage,
                { color: theme.colors.splashTextSecondary },
              ]}
            >
              Your saved journey has not been changed. Try loading it again.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry initialization"
              onPress={() => setBootstrapAttempt(attempt => attempt + 1)}
              style={[
                styles.retryButton,
                { borderColor: theme.colors.splashBorder },
              ]}
            >
              <Text
                style={[
                  styles.retryButtonText,
                  { color: theme.colors.splashText },
                ]}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* Fallback splash cover for boot only — used when the app never
            shows the welcome modal at all (showWelcome persisted false)
            so there's still something covering the loading state.
            Gating this on `!showWelcome` alone was the actual cause of
            the "whole screen fades to black" bug on welcome dismiss:
            WelcomeModal (and its own internal startupOverlay splash,
            which already handles the boot-time fade for users who DO
            see welcome) unmounts the instant `showWelcome` flips false,
            and this standalone overlay — previously not rendered at all
            — mounts FRESH at that exact moment with its internal opacity
            starting at 1 (fully opaque). Since splashStatus is already
            'ready' by then, it immediately started a 600ms fade from
            solid black down to transparent, which is what actually
            produced the "fades to black" look — not the welcome content
            itself, which just vanished instantly underneath it.
            `splashHidden` flips true the first time ANY splash overlay
            (this one, or WelcomeModal's internal one) finishes its real
            fade-out, and never resets except on a bootstrap retry — so
            requiring `!splashHidden` here means this fallback can only
            ever mount once, during genuine initial boot, and never
            re-mounts just because `showWelcome` later toggles off. */}
        {!showWelcome && !splashHidden && (
          <SplashOverlay status={splashStatus} onHidden={handleSplashHidden} />
        )}
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
  bootstrapError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  bootstrapErrorTitle: {
    fontSize: 22,
    fontWeight: '600',
  },
  bootstrapErrorMessage: {
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
