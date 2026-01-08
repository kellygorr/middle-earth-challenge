import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Keyboard,
  FlatList,
} from 'react-native';
import { useTheme } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing, iconSizes } from '../../../styles/global';
import { modalStyles } from '../../../styles/modalStyles';
import Button, { IconButton } from '../../Buttons';
import { useProgressStore } from '../../../stores/progressStore';
import { useUIStore } from '../../../stores/uiStore';
import { EditIcon } from '../../../assets/icons';
import DateStepper from '../../UI/DateStepper';
import { DistanceEntry } from '../../../types';
import { formatDateLabel, formatTime, getYear } from '../../../utils/date';
import EmptyState from '../../UI/EmptyState';

/**
 * MilesContent - FlatList content for the Miles modal.
 * Displays distance entries with inline editing support.
 * Uses uiStore for pending state shared with MilesFooter.
 */
export default function MilesContent() {
  const theme = useTheme();
  const editInputRef = useRef<TextInput>(null);

  // Store state
  const distanceEntries = useProgressStore(state => state.distanceEntries);

  // Pending state from uiStore
  const pendingEntries = useUIStore(state => state.pendingEntries);
  const pendingDeletions = useUIStore(state => state.pendingDeletions);
  const editingEntry = useUIStore(state => state.editingEntry);
  const editDate = useUIStore(state => state.editDate);
  const setEditingEntry = useUIStore(state => state.setEditingEntry);
  const updatePendingEntry = useUIStore(state => state.updatePendingEntry);
  const removePendingEntry = useUIStore(state => state.removePendingEntry);
  const markForDeletion = useUIStore(state => state.markForDeletion);

  // Local edit input state
  const [editInput, setEditInput] = React.useState('');

  // Focus the edit input when editing starts
  useEffect(() => {
    if (editingEntry && editInputRef.current) {
      setEditInput(editingEntry.miles.toString());
      const timer = setTimeout(() => {
        editInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editingEntry]);

  const startEditing = (item: DistanceEntry) => {
    // Toggle: if already editing this item, cancel
    if (editingEntry?.id === item.id) {
      cancelEditing();
      return;
    }
    setEditingEntry(item, item.date);
    setEditInput(item.miles.toString());
  };

  const cancelEditing = () => {
    setEditingEntry(null);
    setEditInput('');
  };

  const handleDateChange = (newDate: number) => {
    if (!editingEntry) return;
    setEditingEntry(editingEntry, newDate);
  };

  const handleEdit = () => {
    if (!editingEntry || editDate === null) return;
    const newMiles = parseFloat(editInput);
    if (isNaN(newMiles) || newMiles <= 0) return;

    if (String(editingEntry.id).startsWith('pending_')) {
      // Update pending entry
      updatePendingEntry(editingEntry.id, { miles: newMiles, date: editDate });
    } else {
      // For existing entries: mark old for deletion, add new pending with same ID
      markForDeletion(editingEntry);
      const updatedEntry: DistanceEntry = {
        id: editingEntry.id,
        saveId: editingEntry.saveId,
        date: editDate,
        miles: newMiles,
        source: editingEntry.source || 'manual',
      };
      useUIStore.getState().addPendingEntry(updatedEntry);
    }

    cancelEditing();
    Keyboard.dismiss();
  };

  const handleDelete = () => {
    if (!editingEntry) return;

    if (String(editingEntry.id).startsWith('pending_')) {
      removePendingEntry(editingEntry.id);
    } else {
      markForDeletion(editingEntry);
    }

    cancelEditing();
    Keyboard.dismiss();
  };

  // Combine and sort entries
  const sortedData = [
    ...(distanceEntries || []).filter(
      d => !pendingDeletions.some(pd => pd.id === d.id),
    ),
    ...pendingEntries,
  ].sort((a, b) => {
    const ta = a.date as number;
    const tb = b.date as number;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });

  // Build year header indices
  const yearHeaderIndices = new Map<number, number>();
  let lastYear: number | null = null;
  sortedData.forEach((item, index) => {
    const itemYear = getYear(item.date);
    if (lastYear === null || itemYear !== lastYear) {
      yearHeaderIndices.set(index, itemYear);
      lastYear = itemYear;
    }
  });

  if (sortedData.length === 0) {
    return (
      <EmptyState
        message={`Add miles to get started tracking your journey!\n\nOr start syncing your health data from the Settings screen`}
      />
    );
  }

  const renderItem = ({
    item,
    index,
  }: {
    item: DistanceEntry;
    index: number;
  }) => (
    <View>
      {yearHeaderIndices.has(index) && (
        <View style={styles.yearHeader}>
          <Text style={typographyThemed(theme).captionSecondary}>
            {yearHeaderIndices.get(index)}
          </Text>
        </View>
      )}
      <View style={styles.listItem}>
        <View style={styles.listItemLeft}>
          <Text style={typographyThemed(theme).bodyPrimary}>
            {formatDateLabel(item.date)}
          </Text>
          <Text style={typographyThemed(theme).captionSecondary}>
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
          <IconButton
            icon={
              <EditIcon
                size={iconSizes.medium}
                color={theme.colors.textSecondary}
              />
            }
            pressedIcon={
              <EditIcon
                size={iconSizes.medium}
                color={theme.colors.textPrimary}
              />
            }
            onPress={() => startEditing(item)}
            variant="transparent"
            hitSlop={16}
          />
        </View>
      </View>
      {editingEntry?.id === item.id && (
        <View style={styles.editSection}>
          <DateStepper
            date={editDate ?? item.date}
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
            <Text style={typographyThemed(theme).bodyPrimary}>miles</Text>
          </View>
          <View style={styles.editButtonsRow}>
            <Button onPress={handleDelete} variant="primary" size="default">
              Delete
            </Button>
            <View style={styles.editButtonsRight}>
              <Button onPress={handleEdit} variant="brand" size="default">
                Update
              </Button>
              <Button onPress={cancelEditing} variant="outline" size="default">
                Close
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const Separator = () => <View style={styles.separator} />;

  return (
    <FlatList
      data={sortedData}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      ItemSeparatorComponent={Separator}
      style={modalStyles.scrollView}
      contentContainerStyle={modalStyles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={false}
    />
  );
}

const styles = StyleSheet.create({
  yearHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
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
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
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
  input: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  editInputField: {
    minWidth: 80,
    textAlign: 'right',
    flex: 1,
  },
});
