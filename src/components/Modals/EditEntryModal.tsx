/**
 * EditEntryModal — a transparent popup that floats above the Distance
 * modal for editing / deleting a single history entry.
 *
 * Layout:
 *   [reset]        Edit            [X]
 *              original: 2:30 PM · 5.2 mi
 *                  [Miles] [Steps]
 *              [◄]  Mon, Jul 26  [►]
 *              [◄]10[►] : [◄]45[►] AM
 *              [ input value ]    unit
 *   [🗑]                                 [ Save ]
 *
 * All edit state (input text, chosen date, source entry) lives in
 * `useUIStore` so both this modal and the list stay in sync. Saving or
 * deleting writes straight to the database.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { useProgressStore } from '../../stores/progressStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, borderRadius, shadows } from '../../styles/global';
import Button, { IconButton } from '../Buttons';
import DateStepper from './DateStepper';
import TimeInput, { type TimeInputHandle } from './TimeInput';
import { CloseIcon, ResetIcon, TrashIcon } from '../../assets/icons';
import { DistanceEntry } from '../../types';
import { milesToSteps, stepsToMiles } from '../../utils/stride';
import { kmToMiles, milesToKm } from '../../utils/date';
import {
  MANUAL_ENTRY_DELETE_ERROR,
  MANUAL_ENTRY_SAVE_ERROR,
  validateManualEntryInput,
} from '../../utils/manualEntryValidation';
import ManualEntryModeSelector, {
  type ManualEntryMode,
} from './ManualEntryModeSelector';

type EditMode = ManualEntryMode;

/**
 * Convert a stored miles value into the string shown in the edit input,
 * respecting the user's unit preference. Rounded to 2 decimals so km
 * conversions don't produce ugly floats.
 */
const formatDistanceInput = (miles: number, useMiles: boolean): string => {
  const display = useMiles ? miles : milesToKm(miles);
  return parseFloat(display.toFixed(2)).toString();
};

const formatStepsInput = (steps: number): string => String(Math.round(steps));

export default function EditEntryModal() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);

  const editingEntry = useUIStore(state => state.editingEntry);
  const editDate = useUIStore(state => state.editDate);
  const setEditingEntry = useUIStore(state => state.setEditingEntry);
  const addDistanceEntry = useProgressStore(state => state.addDistanceEntry);
  const removeDistanceEntry = useProgressStore(
    state => state.removeDistanceEntry,
  );
  const clearTestOverride = useProgressStore(state => state.clearTestOverride);

  const [editMode, setEditMode] = useState<EditMode>('distance');
  const [editInput, setEditInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const timeInputRef = useRef<TimeInputHandle>(null);
  const selectionFrameRef = useRef<number | null>(null);
  // Save and delete stay tappable until the store-driven close renders.
  const actionLockRef = useRef(false);

  // Reset local state whenever a new entry is opened for edit.
  useEffect(() => {
    if (editingEntry) {
      actionLockRef.current = false;
      // Step-based sources open in steps mode so small increments like
      // 15 ft aren't rounded to 0 in the distance field. This covers
      // native pedometer / platform health data plus manual entries the
      // user originally typed as steps.
      const stepBased =
        editingEntry.source === 'pedometer' ||
        editingEntry.source === 'apple-health' ||
        editingEntry.source === 'health-connect' ||
        editingEntry.source === 'manual-steps';
      if (stepBased) {
        setEditMode('steps');
        setEditInput(formatStepsInput(editingEntry.steps ?? 0));
      } else {
        setEditMode('distance');
        setEditInput(formatDistanceInput(editingEntry.miles, useMiles));
      }
      setInputError(null);
    } else {
      setEditInput('');
      setInputError(null);
    }
  }, [editingEntry, useMiles]);

  useEffect(
    () => () => {
      if (selectionFrameRef.current !== null) {
        cancelAnimationFrame(selectionFrameRef.current);
      }
    },
    [],
  );

  const closeModal = () => {
    Keyboard.dismiss();
    setEditingEntry(null);
    setEditInput('');
    setInputError(null);
  };

  const handleDateChange = (newDate: number) => {
    if (!editingEntry) return;
    setEditingEntry(editingEntry, newDate);
  };

  const switchMode = (mode: EditMode) => {
    if (mode === editMode || !editingEntry) return;
    // Repopulate the input in the target unit from the entry's stored
    // values so the user starts from the canonical value in whichever
    // mode they just switched to.
    if (mode === 'steps') {
      setEditInput(formatStepsInput(editingEntry.steps ?? 0));
    } else {
      setEditInput(formatDistanceInput(editingEntry.miles, useMiles));
    }
    setInputError(null);
    setEditMode(mode);
  };

  const resetEdits = () => {
    if (!editingEntry) return;
    // Keep the user's current mode; just refill the input with the
    // entry's original value in that mode and restore the timestamp.
    if (editMode === 'steps') {
      setEditInput(formatStepsInput(editingEntry.steps ?? 0));
    } else {
      setEditInput(formatDistanceInput(editingEntry.miles, useMiles));
    }
    setInputError(null);
    setEditingEntry(editingEntry, editingEntry.date as number);
  };

  const selectEditInput = () => {
    if (selectionFrameRef.current !== null) {
      cancelAnimationFrame(selectionFrameRef.current);
    }
    selectionFrameRef.current = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (typeof input?.setSelection === 'function') {
        input.setSelection(0, editInput.length);
      } else {
        input?.setNativeProps({
          selection: { start: 0, end: editInput.length },
        });
      }
      selectionFrameRef.current = null;
    });
  };

  const cancelPendingSelection = () => {
    if (selectionFrameRef.current !== null) {
      cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = null;
    }
  };

  const handleSave = async () => {
    if (!editingEntry || editDate === null) return;
    const committedDate = timeInputRef.current?.commit() ?? editDate;
    const validation = validateManualEntryInput(
      editInput,
      editMode === 'steps',
    );
    if (validation.value === null) {
      setInputError(validation.error);
      return;
    }
    const inputValue = validation.value;
    setInputError(null);

    let newMiles: number;
    let newSteps: number;
    if (editMode === 'steps') {
      newSteps = inputValue;
      newMiles = stepsToMiles(newSteps);
    } else {
      // Input is in the user's preferred unit; internal model is miles.
      newMiles = useMiles ? inputValue : kmToMiles(inputValue);
      newSteps = milesToSteps(newMiles);
    }

    if (actionLockRef.current) return;
    actionLockRef.current = true;

    // Same id, so the write is an upsert that replaces the row in place.
    const updatedEntry: DistanceEntry = {
      id: editingEntry.id,
      saveId: editingEntry.saveId,
      date: committedDate,
      miles: newMiles,
      steps: newSteps,
      source: editingEntry.source || 'manual',
    };

    try {
      await addDistanceEntry(updatedEntry);
      clearTestOverride();
      closeModal();
    } catch {
      setInputError(MANUAL_ENTRY_SAVE_ERROR);
    } finally {
      actionLockRef.current = false;
    }
  };

  const performDelete = async () => {
    if (!editingEntry) return;
    if (actionLockRef.current) return;
    actionLockRef.current = true;

    try {
      await removeDistanceEntry(editingEntry.id);
      clearTestOverride();
      closeModal();
    } catch {
      setInputError(MANUAL_ENTRY_DELETE_ERROR);
    } finally {
      actionLockRef.current = false;
    }
  };

  const confirmDelete = () => {
    if (!editingEntry) return;
    Alert.alert(
      'Delete entry?',
      'This entry will be permanently removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ],
    );
  };

  const visible = editingEntry !== null;
  const unitLabel = editMode === 'steps' ? 'steps' : useMiles ? 'miles' : 'km';
  const distanceLabel = useMiles ? 'Miles' : 'Km';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeModal}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Dismiss when the user taps outside the card. */}
        <Pressable
          style={[
            styles.backdrop,
            { backgroundColor: theme.colors.modalOverlay },
          ]}
          onPress={closeModal}
        >
          {/* Stop propagation: taps on the card should not dismiss. */}
          <Pressable
            onPress={event => event.stopPropagation()}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.modalBackground,
                borderColor: theme.colors.divider,
              },
              shadows.large,
            ]}
          >
            {/* Header: trash · title · close */}
            <View style={styles.headerRow}>
              <IconButton
                icon={
                  <TrashIcon size={22} color={theme.colors.textSecondary} />
                }
                pressedIcon={
                  <TrashIcon size={22} color={theme.colors.textPrimary} />
                }
                onPress={confirmDelete}
                accessibilityLabel="Delete entry"
                variant="transparent"
                size="small"
                hitSlop={12}
              />
              <Text
                style={[
                  typographyThemed(theme).subtitleLargePrimary,
                  styles.title,
                ]}
              >
                Edit
              </Text>
              <IconButton
                icon={
                  <CloseIcon size={20} color={theme.colors.textSecondary} />
                }
                pressedIcon={
                  <CloseIcon size={20} color={theme.colors.textPrimary} />
                }
                onPress={closeModal}
                accessibilityLabel="Close editor"
                variant="transparent"
                size="small"
                hitSlop={12}
              />
            </View>

            {/* Date + time on the same row */}
            <View style={styles.dateTimeRow}>
              <DateStepper
                date={editDate ?? editingEntry?.date ?? Date.now()}
                onDateChange={handleDateChange}
              />
              <TimeInput
                ref={timeInputRef}
                date={editDate ?? editingEntry?.date ?? Date.now()}
                onDateChange={handleDateChange}
              />
            </View>

            {/* Input row: field + unit label */}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    borderColor: theme.colors.divider,
                  },
                ]}
                value={editInput}
                onChangeText={value => {
                  setEditInput(value);
                  setInputError(null);
                }}
                onFocus={selectEditInput}
                onBlur={cancelPendingSelection}
                keyboardType={
                  editMode === 'steps' ? 'number-pad' : 'decimal-pad'
                }
                disableFullscreenUI={true}
                placeholderTextColor={theme.colors.textSecondary}
                accessibilityLabel={
                  editMode === 'steps' ? 'Steps' : `Distance in ${unitLabel}`
                }
              />
              <Text style={typographyThemed(theme).bodyPrimary}>
                {unitLabel}
              </Text>
            </View>

            <Text
              testID="edit-entry-validation"
              nativeID="edit-entry-validation"
              accessibilityLiveRegion="polite"
              accessibilityRole={inputError ? 'alert' : undefined}
              numberOfLines={1}
              style={[
                typographyThemed(theme).caption2Secondary,
                styles.validationSlot,
              ]}
            >
              {inputError ?? ' '}
            </Text>

            {/* Bottom row: mode toggle (left) · reset + save (right) */}
            <View style={styles.actionsRow}>
              <ManualEntryModeSelector
                value={editMode}
                distanceLabel={distanceLabel}
                onChange={switchMode}
              />
              <View style={styles.actionsRight}>
                <IconButton
                  icon={
                    <ResetIcon
                      size={20}
                      color={theme.colors.buttonOutlineText}
                    />
                  }
                  onPress={resetEdits}
                  accessibilityLabel="Reset changes"
                  variant="outline"
                  size="medium"
                  hitSlop={8}
                />
                <Button onPress={handleSave} variant="brand" size="default">
                  Save
                </Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    textAlign: 'right',
  },
  validationSlot: {
    marginTop: -spacing.sm,
    marginBottom: -spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
