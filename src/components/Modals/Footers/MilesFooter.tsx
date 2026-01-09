import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing } from '../../../styles/global';
import Button from '../../Buttons';
import { useProgressStore } from '../../../stores/progressStore';
import { useUIStore } from '../../../stores/uiStore';
import { DistanceEntry } from '../../../types';
import { formatDistance } from '../../../utils/date';

/**
 * MilesFooter - Footer content for the Miles modal.
 * Displays total and add input. Uses uiStore for pending state.
 */
export default function MilesFooter() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const inputRef = useRef<TextInput>(null);
  const [addInput, setAddInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Store state
  const distanceEntries = useProgressStore(state => state.distanceEntries);
  const totalManualMiles = (distanceEntries || []).reduce(
    (sum, d) => sum + (d?.miles ?? 0),
    0,
  );

  // Pending state from uiStore
  const pendingEntries = useUIStore(state => state.pendingEntries);
  const pendingDeletions = useUIStore(state => state.pendingDeletions);
  const editingEntry = useUIStore(state => state.editingEntry);
  const addPendingEntry = useUIStore(state => state.addPendingEntry);

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
    addPendingEntry(entry);
    setAddInput('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  // Calculate total including pending changes
  const pendingTotal = pendingEntries.reduce((s, e) => s + (e?.miles ?? 0), 0);
  const deletionTotal = pendingDeletions.reduce(
    (s, e) => s + (e?.miles ?? 0),
    0,
  );
  const displayTotal = totalManualMiles - deletionTotal + pendingTotal;

  // Hide in landscape when editing
  if (isLandscape && editingEntry) {
    return null;
  }

  const hasEntries =
    pendingEntries.length > 0 ||
    (distanceEntries && distanceEntries.length > 0);

  return (
    <View style={styles.container}>
      {/* Divider with total miles */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        {hasEntries && (
          <Text
            style={[typographyThemed(theme).bodySecondary, styles.totalText]}
          >
            Total: {formatDistance(displayTotal)} miles
          </Text>
        )}
      </View>

      {/* Add input row */}
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
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Button onPress={handleAdd} variant="brand" size="default">
          {useMiles ? 'Add miles' : 'Add km'}
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  totalText: {
    textAlign: 'right',
  },
  inlineAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  input: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  inlineInput: {
    minWidth: 120,
    textAlign: 'right',
    flex: 1,
  },
});
