import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { spacing, borderRadius, iconSizes } from '../../styles/global';
import { typographyThemed } from '../../styles/typography';
import { ChevronIcon } from '../../assets/icons';
import Button from './Button';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  /** `null` renders `placeholder` and marks nothing as selected. */
  value: string | null;
  /** Re-selecting the active option reports `null` so the caller can clear. */
  onChange: (value: string | null) => void;
  placeholder: string;
  /** Prefixes the trigger label, e.g. `Fake error: timeout`. */
  labelPrefix?: string;
  /** Opens the list above the trigger, for use near the bottom of the screen. */
  openUpward?: boolean;
  disabled?: boolean;
  size?: 'xs' | 'small' | 'default' | 'large';
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder,
  labelPrefix,
  openUpward = false,
  disabled = false,
  size = 'small',
}: DropdownProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const selected = options.find(option => option.value === value) ?? null;
  const text = selected ? selected.label : placeholder;

  return (
    <View style={styles.wrap}>
      <Button
        onPress={() => setIsOpen(open => !open)}
        variant="outline"
        size={size}
        style={styles.trigger}
        disabled={disabled}
      >
        {labelPrefix ? `${labelPrefix} ${text}` : text}
      </Button>
      <View style={styles.caret} pointerEvents="none">
        <ChevronIcon
          direction="right"
          size={iconSizes.small}
          color={theme.colors.textPrimary}
        />
      </View>
      {isOpen && (
        <View
          style={[
            styles.list,
            openUpward ? styles.listAbove : styles.listBelow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.divider,
            },
          ]}
        >
          {options.map(option => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.item,
                  isSelected && {
                    backgroundColor: theme.colors.emptyStateBg,
                  },
                ]}
                onPress={() => {
                  setIsOpen(false);
                  onChange(isSelected ? null : option.value);
                }}
              >
                <Text
                  style={[
                    typographyThemed(theme).caption,
                    { color: theme.colors.textPrimary },
                    isSelected && styles.itemTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-end',
  },
  // Right padding reserves room for the absolutely-positioned caret.
  trigger: {
    paddingRight: iconSizes.small + spacing.md,
  },
  caret: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    transform: [{ rotate: '90deg' }],
  },
  list: {
    position: 'absolute',
    right: 0,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
  },
  listAbove: {
    bottom: '100%',
    marginBottom: spacing.xs,
  },
  listBelow: {
    top: '100%',
    marginTop: spacing.xs,
  },
  item: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  itemTextSelected: {
    fontWeight: '600',
  },
});
