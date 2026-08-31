import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Keyboard } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing } from '../../../styles/global';
import Button from '../../Buttons';
import { useProgressStore } from '../../../stores/progressStore';
import { DistanceEntry } from '../../../types';
import { milesToSteps, stepsToMiles } from '../../../utils/stride';
import { kmToMiles } from '../../../utils/date';
import { DEFAULT_SAVE_ID } from '../../../constants/gameConstants';
import {
  MANUAL_ENTRY_SAVE_ERROR,
  validateManualEntryInput,
} from '../../../utils/manualEntryValidation';
import ManualEntryModeSelector, {
  type ManualEntryMode,
} from '../ManualEntryModeSelector';

type AddMode = ManualEntryMode;

/**
 * MilesFooter - Footer content for the Miles modal.
 * Displays total and add input.
 *
 * The add input can be toggled between distance (miles or km, per the
 * user's unit setting) and steps. Defaults to distance. When steps mode
 * is selected the input takes a whole-step count and we compute the
 * corresponding miles via `stepsToMiles`; when distance mode is selected
 * we derive steps via `milesToSteps` so both fields on the persisted
 * entry stay populated regardless of what the user typed.
 */
export default function MilesFooter() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const inputRef = useRef<TextInput>(null);
  const [addInput, setAddInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('distance');
  const [inputError, setInputError] = useState<string | null>(null);

  const addDistanceEntry = useProgressStore(state => state.addDistanceEntry);
  const clearTestOverride = useProgressStore(state => state.clearTestOverride);
  const addLockRef = useRef(false);

  const handleAdd = async () => {
    const validation = validateManualEntryInput(addInput, addMode === 'steps');
    if (validation.value === null) {
      setInputError(validation.error);
      return;
    }
    const delta = validation.value;
    setInputError(null);
    if (addLockRef.current) return;
    addLockRef.current = true;

    const saveId = DEFAULT_SAVE_ID;
    const timestamp = Date.now();

    let entry: DistanceEntry;
    if (addMode === 'steps') {
      const inputSteps = delta;
      entry = {
        id: `manual_${timestamp}`,
        saveId,
        date: timestamp,
        miles: stepsToMiles(inputSteps),
        steps: inputSteps,
        source: 'manual-steps',
      };
    } else {
      // User input is in their preferred distance unit; internal model
      // is always miles.
      const inputMiles = useMiles ? delta : kmToMiles(delta);
      entry = {
        id: `manual_${timestamp}`,
        saveId,
        date: timestamp,
        miles: inputMiles,
        steps: milesToSteps(inputMiles),
        source: 'manual-distance',
      };
    }

    try {
      await addDistanceEntry(entry);
      clearTestOverride();
      setAddInput('');
      inputRef.current?.blur();
      Keyboard.dismiss();
    } catch {
      setInputError(MANUAL_ENTRY_SAVE_ERROR);
    } finally {
      addLockRef.current = false;
    }
  };

  const switchMode = (mode: AddMode) => {
    if (mode === addMode) return;
    // Values don't translate meaningfully across modes (10 steps ≠ 10
    // miles); clear whatever the user typed so they don't accidentally
    // submit the wrong unit.
    setAddInput('');
    setInputError(null);
    setAddMode(mode);
  };

  const distanceLabel = useMiles ? 'Miles' : 'Km';
  const isSteps = addMode === 'steps';
  const unitLabel = isSteps ? 'steps' : useMiles ? 'miles' : 'km';

  return (
    <View style={styles.container}>
      {/* Divider separating the entry list from the add controls. The
          running total lives on the map screen; per-row and per-day
          totals cover local context so it isn't repeated here. */}
      <View style={styles.dividerLine} />

      {/* Top row: input + unit label */}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            styles.inlineInput,
            {
              backgroundColor: theme.colors.surface,
              color: theme.colors.textPrimary,
              borderColor: theme.colors.divider,
            },
          ]}
          value={addInput}
          onChangeText={value => {
            setAddInput(value);
            setInputError(null);
          }}
          keyboardType={isSteps ? 'number-pad' : 'decimal-pad'}
          disableFullscreenUI={true}
          placeholder={isInputFocused ? '' : '0'}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          placeholderTextColor={theme.colors.textSecondary}
          accessibilityLabel={isSteps ? 'Steps' : `Distance in ${unitLabel}`}
        />
        <Text style={typographyThemed(theme).bodyPrimary}>{unitLabel}</Text>
      </View>

      <Text
        testID="add-entry-validation"
        nativeID="add-entry-validation"
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

      {/* Bottom row: mode toggle (left) · add button (right) */}
      <View style={styles.controlsRow}>
        <ManualEntryModeSelector
          value={addMode}
          distanceLabel={distanceLabel}
          onChange={switchMode}
        />
        <Button onPress={handleAdd} variant="brand" size="default">
          Add
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  dividerLine: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  validationSlot: {
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  inlineInput: {
    minWidth: 120,
    textAlign: 'right',
    flex: 1,
  },
});
