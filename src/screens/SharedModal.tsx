import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { useTheme } from '../stores/settingsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useInitializationStore } from '../stores/initializationStore';
import { useUIStore } from '../stores/uiStore';
import { useProgressStore } from '../stores/progressStore';
import { useInfoStore } from '../stores/infoStore';
import { typographyThemed } from '../styles/typography';
import { spacing, iconSizes } from '../styles/global';
import { modalStyles, modalConstants } from '../styles/modalStyles';
import { useAnimatedModal } from '../hooks/useAnimatedModal';
import { motion } from '../styles/motion';
import Button, { IconButton } from '../components/Buttons';
import { CloseIcon, ChevronIcon, HomeIcon } from '../assets/icons';
import CelebrationBorder from '../components/Modals/CelebrationBorder';
import { MODAL_CONFIG } from '../constants/modals';

/**
 * SharedModal - Stack-based modal navigation with consistent styling.
 *
 * Renders the current modal from the navigation stack with:
 * - Animated overlay and card entrance/exit
 * - Portrait/landscape responsive title positioning
 * - Config-driven props from MODAL_CONFIG
 * - Content switching based on modal type
 * - Optional celebration border overlay
 * - Back navigation when stack depth > 1
 */
export default function SharedModal() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const modalStack = useUIStore(state => state.modalStack);
  const visible = modalStack.length > 0;

  // Key the inner component by orientation to remount and re-animate
  // Always render SharedModalInner - it will handle its own visibility via internalVisible
  return (
    <SharedModalInner
      key={isLandscape ? 'landscape' : 'portrait'}
      visible={visible}
    />
  );
}

interface SharedModalInnerProps {
  visible: boolean;
}

/**
 * Inner modal component that handles all rendering and animation.
 * Keyed by orientation in parent to force remount on rotation.
 */
function SharedModalInner({ visible }: SharedModalInnerProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Modal stack state
  const modalStack = useUIStore(state => state.modalStack);
  const popModal = useUIStore(state => state.popModal);
  const closeAllModals = useUIStore(state => state.closeAllModals);

  // For home button callback
  const setPhase = useInitializationStore(state => state.setPhase);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);

  // Celebration state for info modal
  const showCelebration = useInfoStore(state => state.showCelebration);

  const canGoBack = modalStack.length > 1;
  const currentModal = modalStack[modalStack.length - 1];
  const modalType = currentModal?.type;

  // Get config for current modal type
  const config = modalType ? MODAL_CONFIG[modalType] : null;
  const ContentComponent = config?.content ?? null;

  const containerHeight = Math.round(
    height * modalConstants.portraitHeightRatio,
  );

  const {
    internalVisible,
    animatedBackgroundStyle,
    animatedContentStyle,
    contentOpacitySV,
    dismiss,
  } = useAnimatedModal(visible, {
    entranceDelay: motion.modal.entranceDelay,
    entranceDuration: motion.modal.entranceDuration,
    exitDuration: motion.modal.exitDuration,
    easing: motion.easing.standard,
    translateDistance: -spacing.lg,
  });

  // Handle dismiss - closes all modals and commits pending changes
  const handleDismiss = async (afterCallback?: () => void) => {
    // Commit pending miles if any
    const uiState = useUIStore.getState();
    if (
      uiState.pendingEntries.length > 0 ||
      uiState.pendingDeletions.length > 0
    ) {
      const progressState = useProgressStore.getState();
      const baseMiles = progressState.isTestOverride
        ? progressState.testOverrideBaseMiles ?? 0
        : progressState.miles ?? 0;
      const pendingTotal = uiState.pendingEntries.reduce(
        (sum, e) => sum + (e?.miles ?? 0),
        0,
      );
      const deletionTotal = uiState.pendingDeletions.reduce(
        (sum, e) => sum + (e?.miles ?? 0),
        0,
      );

      // Apply deletions
      for (const d of uiState.pendingDeletions) {
        await progressState.removeDistanceEntry(d.id);
      }

      // Apply additions
      for (let idx = 0; idx < uiState.pendingEntries.length; idx++) {
        const e = uiState.pendingEntries[idx];
        const persisted = { ...e, id: `manual_${Date.now()}_${idx}` };
        await progressState.addDistanceEntry(persisted);
      }

      // Update miles
      if (pendingTotal > 0 || deletionTotal > 0) {
        const newMiles = baseMiles + pendingTotal - deletionTotal;
        progressState.setMiles(newMiles);
        await progressState.persistMilesSnapshot();
      }

      if (progressState.isTestOverride) {
        progressState.clearTestOverride();
      }
    }

    // Reset pending state
    uiState.resetPendingMiles();

    // Schedule callback and close modal
    // Note: dismiss() sets callback ref, closeAllModals triggers exit animation
    // The callback will be called after exit animation completes
    dismiss(afterCallback);
    closeAllModals();
  };

  // Handle back navigation
  const handleBack = () => {
    popModal();
  };

  // Handle home button press (settings modal)
  const handleHomePress = () => {
    handleDismiss(() => {
      setPhase('ready');
      setShowWelcome(true);
    });
  };

  // Sync card shadow/background with content fade
  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      contentOpacitySV.value,
      [0, 1],
      ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'],
    ),
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

  // Use celebration gold overlay for info modal celebrations
  const finalOverlayColor =
    showCelebration && modalType === 'info'
      ? theme.colors.modalCelebrationGold
      : theme.colors.modalOverlay;
  const maxWidth = config?.narrow
    ? modalConstants.maxWidthNarrow
    : modalConstants.maxWidth;

  // Render left button based on config and stack state
  const renderLeftButton = () => {
    // If canGoBack, show back button unless leftButton is explicitly 'home'
    if (canGoBack && config?.leftButton !== 'home') {
      return (
        <Button
          onPress={handleBack}
          variant="transparent"
          size="default"
          align="left"
          iconBefore={<ChevronIcon direction="left" size={iconSizes.medium} />}
        >
          Back
        </Button>
      );
    }

    if (config?.leftButton === 'home') {
      return (
        <IconButton
          icon={<HomeIcon size={iconSizes.medium} />}
          onPress={handleHomePress}
          variant="transparent"
          hitSlop={16}
        />
      );
    }

    if (config?.leftButton === 'back') {
      return (
        <IconButton
          icon={<ChevronIcon direction="left" size={iconSizes.medium} />}
          onPress={handleBack}
          variant="primary"
          hitSlop={8}
        />
      );
    }

    return null;
  };

  // Render content based on scrollType
  const renderContent = () => {
    if (!ContentComponent) {
      return null;
    }

    const scrollType = config?.scrollType ?? 'default';

    // Custom: content handles its own layout/scrolling
    if (scrollType === 'custom') {
      return <ContentComponent />;
    }

    // Default: wrap in ScrollView
    return (
      <ScrollView
        style={modalStyles.scrollView}
        contentContainerStyle={modalStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <ContentComponent />
      </ScrollView>
    );
  };

  // Render footer if configured
  const FooterComponent = config?.footer ?? null;
  const renderFooter = () => {
    if (!FooterComponent) return null;
    return <FooterComponent />;
  };

  // Stack item title takes precedence over config (for dynamic titles like "Checkpoint #3")
  const title = currentModal?.title ?? config?.title ?? '';
  const keyboardAvoiding = config?.keyboardAvoiding ?? false;
  const leftButtonElement = renderLeftButton();

  const contentView = (
    <Animated.View
      style={[
        modalStyles.contentWrapper,
        { maxWidth },
        !isLandscape && { maxHeight: containerHeight },
        animatedContentStyle,
      ]}
    >
      {/* Portrait: Title above modal */}
      {!isLandscape && (
        <Text
          style={[
            typographyThemed(theme).titleMediumInverted,
            modalStyles.title,
          ]}
        >
          {title}
        </Text>
      )}

      {/* Horizontal container: vertical title on left (landscape only) + modal card */}
      <View style={modalStyles.horizontalLayout}>
        {/* Vertical Title - Running up the left side (landscape only) */}
        {isLandscape && (
          <View style={modalStyles.verticalTitleContainer}>
            <Text
              style={[
                typographyThemed(theme).titleMediumInverted,
                modalStyles.verticalTitle,
              ]}
            >
              {title}
            </Text>
          </View>
        )}

        <Animated.View style={[modalStyles.modalContainer, animatedCardStyle]}>
          {/* Header row with navigation buttons */}
          <View style={localStyles.headerRow}>
            <View style={localStyles.headerLeft}>{leftButtonElement}</View>
            <View style={localStyles.headerRight}>
              <IconButton
                icon={<CloseIcon size={iconSizes.medium} />}
                onPress={() => handleDismiss()}
                variant="transparent"
                hitSlop={16}
              />
            </View>
          </View>

          {/* Content */}
          {renderContent()}

          {/* Footer (if configured) */}
          {renderFooter()}
        </Animated.View>
      </View>
    </Animated.View>
  );

  // Don't render anything if not visible (after exit animation completes)
  if (!internalVisible) {
    return null;
  }

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={() => handleDismiss()}
      statusBarTranslucent={true}
    >
      {/* iOS Modals render in a separate native window, so need their own SafeAreaProvider */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <Animated.View
          style={[
            modalStyles.overlay,
            { backgroundColor: finalOverlayColor },
            animatedBackgroundStyle,
          ]}
        >
          <TouchableWithoutFeedback onPress={() => handleDismiss()}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <SafeAreaView
            style={modalStyles.safeArea}
            edges={['top', 'bottom']}
            pointerEvents="box-none"
          >
            {keyboardAvoiding ? (
              <KeyboardAvoidingView
                style={localStyles.keyboardAvoidingView}
                behavior={'padding'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? spacing.lg : 0}
              >
                {contentView}
              </KeyboardAvoidingView>
            ) : (
              contentView
            )}
          </SafeAreaView>
        </Animated.View>

        {/* Celebration border overlay - triggered for checkpoint celebrations */}
        <CelebrationBorder
          show={showCelebration && modalType === 'info'}
          borderWidth={5}
          cycleDurationMs={3000}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
});

/**
 * Hook to get modal layout values for custom modal implementations
 */
export function useModalLayout() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const insets = useSafeAreaInsets();
  const safeHeight = Math.max(0, height - insets.top - insets.bottom);
  const containerHeight = Math.round(
    safeHeight * modalConstants.portraitHeightRatio,
  );

  return {
    isLandscape,
    containerHeight,
    safeHeight,
    insets,
    width,
    height,
  };
}
