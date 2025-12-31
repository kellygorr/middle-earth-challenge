import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, shadows, iconSizes } from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
import Button from '../Buttons';
import { useProgressStore } from '../../stores/progressStore';
import { CloseButton } from '../ButtonIcons';
import { DailyDistance } from '../../types';
import { formatDateLabel } from '../../utils/date';
import { database } from '../../services/database';

const sepStyles = StyleSheet.create({
  separator: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
});

const Separator = () => <View style={sepStyles.separator} />;

interface ManualMilesModalProps {
  visible: boolean;
  onDismiss: () => void;
}

// formatted date helper moved to src/utils/date

export default function ManualMilesModal({
  visible,
  onDismiss,
}: ManualMilesModalProps) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [pendingEntries, setPendingEntries] = useState<DailyDistance[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<DailyDistance[]>([]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const setMiles = useProgressStore(state => state.setMiles);
  const dailyDistances = useProgressStore(state => state.dailyDistances);
  const addDailyDistance = useProgressStore(state => state.addDailyDistance);
  const totalManualMiles = (dailyDistances || []).reduce(
    (sum, d) => sum + (d?.miles ?? 0),
    0,
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
    translateDistance: -spacing.lg,
  });

  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      contentOpacitySV.value,
      [0, 1],
      ['transparent', theme.colors.surface],
    ),
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

  const handleAdd = () => {
    const delta = parseFloat(input);
    if (isNaN(delta) || delta <= 0) {
      return;
    }
    const saveId = 'default';
    const timestamp = Date.now();
    const entry: DailyDistance = {
      id: `pending_${Date.now()}`,
      saveId,
      date: timestamp,
      miles: delta,
    };
    setPendingEntries(prev => [entry, ...prev]);
    setInput('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const commitAndDismiss = async () => {
    const state = useProgressStore.getState();
    const baseMiles = state.isTestOverride
      ? state.testOverrideBaseMiles ?? 0
      : state.miles ?? 0;
    const pendingTotal = pendingEntries.reduce(
      (sum, e) => sum + (e?.miles ?? 0),
      0,
    );
    const deletionTotal = pendingDeletions.reduce(
      (sum, e) => sum + (e?.miles ?? 0),
      0,
    );
    // Apply deletions to store entries
    if (pendingDeletions.length > 0) {
      for (const d of pendingDeletions) {
        useProgressStore.getState().removeDailyDistance(d.id);
        try {
          await database.removeDailyDistance(d.id);
        } catch (e) {
          console.warn('Failed to remove distance from DB:', e);
        }
      }
    }
    // Apply additions to store entries
    if (pendingTotal > 0) {
      for (let idx = 0; idx < pendingEntries.length; idx++) {
        const e = pendingEntries[idx];
        const persisted = { ...e, id: `manual_${Date.now()}_${idx}` };
        addDailyDistance(persisted);
        try {
          await database.addDailyDistance({
            id: persisted.id,
            saveId: persisted.saveId,
            date: persisted.date as number,
            miles: persisted.miles,
          });
        } catch (err) {
          console.warn('Failed to persist distance:', err);
        }
      }
    }
    // Update miles once with adds minus deletions
    if (pendingTotal > 0 || deletionTotal > 0) {
      const newMiles = baseMiles + pendingTotal - deletionTotal;
      setMiles(newMiles);
      try {
        await database.setMilesSnapshot('default', newMiles);
      } catch (e) {
        console.warn('Failed to update miles snapshot:', e);
      }
    }
    if (state.isTestOverride) {
      useProgressStore.getState().clearTestOverride();
    }
    setPendingEntries([]);
    setPendingDeletions([]);
    onDismiss();
  };

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={commitAndDismiss}
      statusBarTranslucent={true}
    >
      <Animated.View
        style={[
          styles.overlay,
          { backgroundColor: theme.colors.modalOverlay },
          animatedBackgroundStyle,
        ]}
      >
        <TouchableWithoutFeedback onPress={commitAndDismiss}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <SafeAreaView
          style={styles.safeArea}
          edges={['top', 'bottom']}
          pointerEvents="box-none"
        >
          <KeyboardAvoidingView
            style={styles.contentWrapper}
            behavior={'padding'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? spacing.lg : 0}
            enabled={true}
          >
            <Animated.View style={[styles.contentInner, animatedContentStyle]}>
              <Text
                style={[
                  typographyThemed(theme).titleMediumInverted,
                  styles.title,
                ]}
              >
                Miles
              </Text>
              <Animated.View style={[styles.modalContainer, animatedCardStyle]}>
                <CloseButton
                  style={styles.closeButton}
                  size={iconSizes.medium}
                  onPress={commitAndDismiss}
                />
                {/* Recent recorded miles (flex to push input to bottom) */}
                <View style={styles.listSection}>
                  <View style={styles.listContainer}>
                    <Text
                      style={[
                        typographyThemed(theme).subtitleLargePrimary,
                        styles.sectionTitle,
                      ]}
                    >
                      Recent Miles
                    </Text>
                    {pendingEntries.length > 0 ||
                    (dailyDistances && dailyDistances.length > 0) ? (
                      <FlatList
                        data={[
                          ...(dailyDistances || []).filter(
                            d => !pendingDeletions.some(pd => pd.id === d.id),
                          ),
                          ...pendingEntries,
                        ].sort((a, b) => {
                          // date is a timestamp (ms); sort oldest first
                          const ta = a.date as number;
                          const tb = b.date as number;
                          if (ta !== tb) return ta - tb;
                          // Stable tie-breaker if same timestamp
                          return String(a.id).localeCompare(String(b.id));
                        })}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                          <View style={styles.listItem}>
                            <Text style={typographyThemed(theme).bodyPrimary}>
                              {formatDateLabel(item.date)}
                            </Text>
                            <View style={styles.listItemRight}>
                              <Text style={typographyThemed(theme).bodyPrimary}>
                                {item.miles.toFixed(2)}
                              </Text>
                              <CloseButton
                                size={iconSizes.small}
                                color={theme.colors.textSecondary}
                                pressedColor={theme.colors.textPrimary}
                                onPress={() => {
                                  if (String(item.id).startsWith('pending_')) {
                                    setPendingEntries(prev =>
                                      prev.filter(e => e.id !== item.id),
                                    );
                                  } else {
                                    setPendingDeletions(prev => [
                                      item as DailyDistance,
                                      ...prev,
                                    ]);
                                  }
                                }}
                                style={styles.trashButton}
                              />
                            </View>
                          </View>
                        )}
                        ItemSeparatorComponent={Separator}
                        showsVerticalScrollIndicator={false}
                      />
                    ) : (
                      <View style={styles.emptyState}>
                        <Text style={typographyThemed(theme).bodySecondary}>
                          No miles recorded yet
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Divider with total miles (including pending) */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  {(pendingEntries.length > 0 ||
                    (dailyDistances && dailyDistances.length > 0)) && (
                    <Text
                      style={[
                        typographyThemed(theme).bodySecondary,
                        styles.totalText,
                      ]}
                    >
                      Total:{' '}
                      {(
                        totalManualMiles -
                        pendingDeletions.reduce(
                          (s, e) => s + (e?.miles ?? 0),
                          0,
                        ) +
                        pendingEntries.reduce((s, e) => s + (e?.miles ?? 0), 0)
                      ).toFixed(2)}{' '}
                      miles
                    </Text>
                  )}
                </View>

                <View style={styles.inlineAddRow}>
                  <TextInput
                    ref={inputRef}
                    style={[
                      styles.input,
                      styles.inlineInput,
                      {
                        backgroundColor: theme.colors.surface,
                        color: theme.colors.textPrimary,
                        borderWidth: 1,
                        borderColor: theme.colors.divider,
                      },
                    ]}
                    value={input}
                    onChangeText={setInput}
                    keyboardType="numeric"
                    placeholder={isInputFocused ? '' : '0'}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                  <Button onPress={handleAdd} variant="brand" size="default">
                    Add miles
                  </Button>
                </View>
              </Animated.View>
            </Animated.View>
          </KeyboardAvoidingView>
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
    maxWidth: 500,
    flex: 1,
    maxHeight: '80%',
    alignItems: 'flex-start',
  },
  contentInner: {
    width: '100%',
    flex: 1,
  },
  title: {
    marginBottom: spacing.sm,
  },
  modalContainer: {
    width: '100%',
    flex: 1,
    minHeight: 400,
    borderRadius: 16,
    ...shadows.large,
    padding: spacing.lg,
    paddingTop: spacing.xl, // space for close button
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
  inlineAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  inlineInput: {
    minWidth: 120,
    textAlign: 'right',
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: 0,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  totalText: {
    textAlign: 'right',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  listContainer: {
    flex: 1,
    marginBottom: spacing.md,
  },
  listSection: {
    flex: 1,
    marginBottom: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trashButton: {
    marginLeft: spacing.xs,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
});
