import React, { ReactNode } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  useWindowDimensions,
  ViewStyle,
  StyleProp,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
  SharedValue,
} from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconSizes } from '../../styles/global';
import { modalStyles, modalConstants } from '../../styles/modalStyles';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
import { CloseButton } from '../ButtonIcons';

export interface ModalWrapperProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal should be dismissed (overlay tap, close button, back button) */
  onDismiss: () => void;
  /** Title displayed above modal (portrait) or on left side (landscape) */
  title: string;
  /** Modal content */
  children: ReactNode;
  /** Optional left header button (e.g., HomeButton) */
  leftButton?: ReactNode;
  /** Optional custom overlay background color */
  overlayColor?: string;
  /** Optional additional style for the modal card */
  cardStyle?: StyleProp<ViewStyle>;
  /** Use narrower max-width (for info-style modals) */
  narrow?: boolean;
  /** Custom translateDistance for entrance animation */
  translateDistance?: number;
  /** Whether to apply default card background color (default: true) */
  applyDefaultBackground?: boolean;
  /** Called after modal content finishes animating in */
  onAnimationComplete?: () => void;
  /** Custom content opacity shared value (for external animation sync) */
  contentOpacitySV?: SharedValue<number>;
  /** Whether the modal card has a small header (no left button, 48px padding) */
  smallHeader?: boolean;
  /** Whether to enable keyboard avoiding behavior (for modals with text inputs) */
  keyboardAvoiding?: boolean;
}

/**
 * Shared modal wrapper component that provides:
 * - Consistent overlay and animation behavior
 * - Portrait/landscape responsive title positioning
 * - Close button (and optional left button) header
 * - Animated card with shadow/background fade
 */
export default function ModalWrapper({
  visible,
  onDismiss,
  title,
  children,
  leftButton,
  overlayColor,
  cardStyle,
  narrow = false,
  translateDistance = -spacing.lg,
  applyDefaultBackground = true,
  smallHeader = false,
  keyboardAvoiding = false,
}: ModalWrapperProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const insets = useSafeAreaInsets();
  const safeHeight = Math.max(0, height - insets.top - insets.bottom);
  const containerHeight = Math.round(
    safeHeight * modalConstants.portraitHeightRatio,
  );

  const {
    internalVisible,
    animatedBackgroundStyle,
    animatedContentStyle,
    contentOpacitySV,
  } = useAnimatedModal(visible, {
    entranceDelay: motion.modal.entranceDelay,
    entranceDuration: motion.modal.entranceDuration,
    exitDuration: motion.modal.exitDuration,
    easing: motion.easing.standard,
    translateDistance,
  });

  // Sync card shadow/background with content fade
  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: applyDefaultBackground
      ? interpolateColor(
          contentOpacitySV.value,
          [0, 1],
          ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'],
        )
      : undefined,
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

  const finalOverlayColor = overlayColor ?? theme.colors.modalOverlay;
  const maxWidth = narrow
    ? modalConstants.maxWidthNarrow
    : modalConstants.maxWidth;

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

        <Animated.View
          style={[
            modalStyles.modalContainer,
            smallHeader && modalStyles.modalContainerSmallHeader,
            animatedCardStyle,
            cardStyle,
          ]}
        >
          {/* Optional left button */}
          {leftButton && (
            <View style={modalStyles.leftButton}>{leftButton}</View>
          )}

          {/* Close button */}
          <CloseButton
            style={modalStyles.closeButton}
            size={iconSizes.medium}
            onPress={onDismiss}
          />

          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent={true}
    >
      <Animated.View
        style={[
          modalStyles.overlay,
          { backgroundColor: finalOverlayColor },
          animatedBackgroundStyle,
        ]}
      >
        <TouchableWithoutFeedback onPress={onDismiss}>
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
