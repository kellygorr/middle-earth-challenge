import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, shadows } from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
import Button from '../Buttons';
import { useProgressStore } from '../../stores/progressStore';

interface ManualMilesModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function ManualMilesModal({
  visible,
  onDismiss,
}: ManualMilesModalProps) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const setMiles = useProgressStore(state => state.setMiles);

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
    translateDistance: -spacing.lg,
  });

  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      contentOpacitySV.value,
      [0, 1],
      ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'],
    ),
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

  const handleAdd = () => {
    const delta = parseFloat(input);
    if (isNaN(delta) || delta <= 0) {
      onDismiss();
      return;
    }
    const current = useProgressStore.getState().miles || 0;
    setMiles(current + delta);
    onDismiss();
  };

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
          styles.overlay,
          { backgroundColor: theme.colors.modalOverlay },
          animatedBackgroundStyle,
        ]}
      >
        <TouchableWithoutFeedback onPress={onDismiss}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <SafeAreaView
          style={styles.safeArea}
          edges={['top', 'bottom']}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.contentWrapper, animatedContentStyle]}>
            <Text
              style={[
                typographyThemed(theme).titleMediumInverted,
                styles.title,
              ]}
            >
              Add Miles
            </Text>
            <Animated.View style={[styles.modalContainer, animatedCardStyle]}>
              <View style={styles.formRow}>
                <Text style={typographyThemed(theme).bodyPrimary}>Miles</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                    },
                  ]}
                  value={input}
                  onChangeText={setInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>
              <View style={styles.actionsRow}>
                <Button onPress={onDismiss} variant="outline" size="default">
                  Cancel
                </Button>
                <Button onPress={handleAdd} variant="brand" size="default">
                  Add
                </Button>
              </View>
            </Animated.View>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 400,
    flex: 1,
    maxHeight: '40%',
    alignItems: 'flex-start',
  },
  title: {
    marginBottom: spacing.sm,
  },
  modalContainer: {
    width: '100%',
    borderRadius: 16,
    ...shadows.large,
    padding: spacing.lg,
  },
  formRow: {
    marginBottom: spacing.md,
  },
  input: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
