import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconSizes } from '../../styles/global';

import ModalWrapper from './ModalWrapper';
import Button from '../Buttons';
import { useProgressStore } from '../../stores/progressStore';
import { EditButton } from '../ButtonIcons';
import DateStepper from '../DateStepper';
import { DistanceEntry } from '../../types';
import { formatDateLabel, formatTime, getYear } from '../../utils/date';

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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [addInput, setAddInput] = useState('');
  const [editInput, setEditInput] = useState('');
  const [pendingEntries, setPendingEntries] = useState<DistanceEntry[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<DistanceEntry[]>([]);
  const [editingItem, setEditingItem] = useState<DistanceEntry | null>(null);
  const [editDate, setEditDate] = useState<number>(Date.now());
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const editInputRef = useRef<TextInput>(null);

  // Focus the edit input after a delay to avoid keyboard open/close issue
  useEffect(() => {
    if (editingItem && editInputRef.current) {
      const timer = setTimeout(() => {
        editInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editingItem]);

  const setMiles = useProgressStore(state => state.setMiles);
  const distanceEntries = useProgressStore(state => state.distanceEntries);
  const addDistanceEntry = useProgressStore(state => state.addDistanceEntry);
  const totalManualMiles = (distanceEntries || []).reduce(
    (sum, d) => sum + (d?.miles ?? 0),
    0,
  );

  const handleAdd = () => {
    const delta = parseFloat(addInput);
    if (isNaN(delta) || delta <= 0) {
      return;
    }
    const saveId = 'default';
    const timestamp = Date.now();
    const entry: DistanceEntry = {
      id: `pending_${Date.now()}`,
      saveId,
      date: timestamp,
      miles: delta,
      source: 'manual',
    };
    setPendingEntries(prev => [entry, ...prev]);
    setAddInput('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const handleEdit = () => {
    if (!editingItem) return;
    const newMiles = parseFloat(editInput);
    if (isNaN(newMiles) || newMiles <= 0) return;

    if (String(editingItem.id).startsWith('pending_')) {
      // Update pending entry
      setPendingEntries(prev =>
        prev.map(e =>
          e.id === editingItem.id
            ? { ...e, miles: newMiles, date: editDate }
            : e,
        ),
      );
    } else {
      // For existing entries: mark old for deletion, add new pending with same ID
      // Preserving the original ID prevents duplicates when syncing again
      setPendingDeletions(prev => [editingItem, ...prev]);
      const updatedEntry: DistanceEntry = {
        id: editingItem.id, // Keep original ID to prevent sync duplicates
        saveId: editingItem.saveId,
        date: editDate,
        miles: newMiles,
        source: editingItem.source || 'manual',
      };
      setPendingEntries(prev => [updatedEntry, ...prev]);
    }

    setEditingItem(null);
    setEditInput('');
    Keyboard.dismiss();
  };

  const handleDelete = () => {
    if (!editingItem) return;

    if (String(editingItem.id).startsWith('pending_')) {
      setPendingEntries(prev => prev.filter(e => e.id !== editingItem.id));
    } else {
      setPendingDeletions(prev => [editingItem, ...prev]);
    }

    setEditingItem(null);
    setEditInput('');
    Keyboard.dismiss();
  };

  const startEditing = (item: DistanceEntry) => {
    // Toggle: if already editing this item, cancel
    if (editingItem?.id === item.id) {
      cancelEditing();
      return;
    }
    setEditingItem(item);
    setEditInput(item.miles.toString());
    setEditDate(item.date as number);
  };

  const cancelEditing = () => {
    setEditingItem(null);
    setEditInput('');
  };

  const handleDateChange = (newDate: number) => {
    if (!editingItem) return;
    // Just track the new date - apply it when Update button is pressed
    // This prevents the list from re-sorting while editing
    setEditDate(newDate);
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
    // Apply deletions (store handles persistence)
    if (pendingDeletions.length > 0) {
      for (const d of pendingDeletions) {
        await useProgressStore.getState().removeDistanceEntry(d.id);
      }
    }
    // Apply additions (store handles persistence)
    if (pendingTotal > 0) {
      for (let idx = 0; idx < pendingEntries.length; idx++) {
        const e = pendingEntries[idx];
        const persisted = { ...e, id: `manual_${Date.now()}_${idx}` };
        await addDistanceEntry(persisted);
      }
    }
    // Update miles once with adds minus deletions
    if (pendingTotal > 0 || deletionTotal > 0) {
      const newMiles = baseMiles + pendingTotal - deletionTotal;
      setMiles(newMiles);
      await useProgressStore.getState().persistMilesSnapshot();
    }
    if (state.isTestOverride) {
      useProgressStore.getState().clearTestOverride();
    }
    setPendingEntries([]);
    setPendingDeletions([]);
    onDismiss();
  };

  return (
    <ModalWrapper
      key={isLandscape ? 'landscape' : 'portrait'}
      visible={visible}
      onDismiss={commitAndDismiss}
      title="Miles"
      smallHeader
      keyboardAvoiding
      cardStyle={styles.cardStyle}
    >
      {/* Recent recorded miles (flex to push input to bottom) */}
      <View style={styles.listSection}>
        <View style={styles.listContainer}>
          {pendingEntries.length > 0 ||
          (distanceEntries && distanceEntries.length > 0) ? (
            (() => {
              const sortedData = [
                ...(distanceEntries || []).filter(
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
              });

              // Build a set of indices where we need year headers
              const yearHeaderIndices = new Map<number, number>();
              let lastYear: number | null = null;
              sortedData.forEach((item, index) => {
                const itemYear = getYear(item.date);
                if (lastYear === null || itemYear !== lastYear) {
                  yearHeaderIndices.set(index, itemYear);
                  lastYear = itemYear;
                }
              });

              return (
                <FlatList
                  data={sortedData}
                  keyExtractor={item => item.id}
                  renderItem={({ item, index }) => (
                    <View>
                      {yearHeaderIndices.has(index) && (
                        <View style={styles.yearHeader}>
                          <Text
                            style={typographyThemed(theme).captionSecondary}
                          >
                            {yearHeaderIndices.get(index)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.listItem}>
                        <View style={styles.listItemLeft}>
                          <Text style={typographyThemed(theme).bodyPrimary}>
                            {formatDateLabel(item.date)}
                          </Text>
                          <Text
                            style={typographyThemed(theme).captionSecondary}
                          >
                            {formatTime(item.date as number)} ·{' '}
                            {item.source === 'health-connect'
                              ? 'Health Connect'
                              : item.source === 'synced'
                              ? 'Synced'
                              : 'Manual'}
                          </Text>
                        </View>
                        <View style={styles.listItemRight}>
                          <Text style={typographyThemed(theme).bodyPrimary}>
                            {item.miles.toFixed(2)}
                          </Text>
                          <EditButton
                            size={iconSizes.medium}
                            color={theme.colors.textSecondary}
                            pressedColor={theme.colors.textPrimary}
                            onPress={() => startEditing(item)}
                            style={styles.editButton}
                          />
                        </View>
                      </View>
                      {editingItem?.id === item.id && (
                        <View style={styles.editSection}>
                          <DateStepper
                            date={editDate}
                            onDateChange={handleDateChange}
                          />
                          <View style={styles.editFieldsRow}>
                            <TextInput
                              ref={editInputRef}
                              style={[
                                styles.input,
                                styles.editInputField,
                                {
                                  backgroundColor: theme.colors.surface,
                                  color: theme.colors.textPrimary,
                                  borderWidth: 1,
                                  borderColor: theme.colors.divider,
                                },
                              ]}
                              value={editInput}
                              onChangeText={setEditInput}
                              keyboardType="numeric"
                              selectTextOnFocus
                              disableFullscreenUI={true}
                              placeholderTextColor={theme.colors.textSecondary}
                            />
                            <Text style={typographyThemed(theme).bodyPrimary}>
                              miles
                            </Text>
                          </View>
                          <View style={styles.editButtonsRow}>
                            <Button
                              onPress={handleDelete}
                              variant="primary"
                              size="default"
                            >
                              Delete
                            </Button>
                            <View style={styles.editButtonsRight}>
                              <Button
                                onPress={handleEdit}
                                variant="brand"
                                size="default"
                              >
                                Update
                              </Button>
                              <Button
                                onPress={cancelEditing}
                                variant="outline"
                                size="default"
                              >
                                Close
                              </Button>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                  ItemSeparatorComponent={Separator}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                />
              );
            })()
          ) : (
            <View style={styles.emptyState}>
              <Text
                style={[
                  typographyThemed(theme).bodySecondary,
                  styles.emptyStateText,
                ]}
              >
                Add miles to get started tracking your journey! {'\n\n'}Or start
                syncing your health data from the Settings screen
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Hide total and add section in landscape mode when editing */}
      {!(isLandscape && editingItem) && (
        <>
          {/* Divider with total miles (including pending) */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            {(pendingEntries.length > 0 ||
              (distanceEntries && distanceEntries.length > 0)) && (
              <Text
                style={[
                  typographyThemed(theme).bodySecondary,
                  styles.totalText,
                ]}
              >
                Total:{' '}
                {(
                  totalManualMiles -
                  pendingDeletions.reduce((s, e) => s + (e?.miles ?? 0), 0) +
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
              value={addInput}
              onChangeText={setAddInput}
              keyboardType="decimal-pad"
              disableFullscreenUI={true}
              placeholder={isInputFocused ? '' : '0'}
              onFocus={() => {
                setIsInputFocused(true);
                // Cancel any edit mode when focusing the add input
                if (editingItem) cancelEditing();
              }}
              onBlur={() => setIsInputFocused(false)}
              placeholderTextColor={theme.colors.textSecondary}
            />
            <Button onPress={handleAdd} variant="brand" size="default">
              Add miles
            </Button>
          </View>
        </>
      )}
    </ModalWrapper>
  );
}

const styles = StyleSheet.create({
  cardStyle: {
    padding: spacing.lg,
    paddingTop: spacing.xl, // space for close button
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
  listContainer: {
    flex: 1,
  },
  listSection: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    textAlign: 'center',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  listItemLeft: {
    flexDirection: 'column',
  },
  yearHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editButton: {
    // No extra margin needed
  },
  editSection: {
    paddingVertical: spacing.sm,
  },
  editFieldsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  editButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  editButtonsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editInputField: {
    minWidth: 80,
    textAlign: 'right',
    flex: 1,
  },
});
