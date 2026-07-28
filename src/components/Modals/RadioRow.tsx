/**
 * RadioRow - A row with a leading radio circle, primary label,
 * optional description, and an optional right-side adornment (used for
 * inline status like "✓ Connected"). Tapping the row calls onPress.
 *
 * The whole row is pressable so the touch target is generous — the
 * radio circle itself is a visual indicator only.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';

interface RadioRowProps {
  /** Primary label text */
  label: string;
  /** Optional description below label (single line or wrapped) */
  description?: string | React.ReactNode;
  /** Whether this option is the current selection */
  selected: boolean;
  /** Tap handler */
  onPress: () => void;
  /** Disable interaction (e.g. during in-flight switch) */
  disabled?: boolean;
  /**
   * Optional slot rendered below the description. Kept outside the
   * row's Pressable so tapping the footer does not select the radio —
   * this is intended for expanders, secondary actions, etc.
   */
  footer?: React.ReactNode;
  /** Show a border on top of the row */
  borderTop?: boolean;
  /** Show a border on bottom of the row */
  borderBottom?: boolean;
}

export default function RadioRow({
  label,
  description,
  selected,
  onPress,
  disabled,
  footer,
  borderTop,
  borderBottom,
}: RadioRowProps) {
  const theme = useTheme();

  const outerColor = selected
    ? theme.colors.buttonPrimary
    : theme.colors.divider;
  const innerColor = theme.colors.buttonPrimary;

  const rowStyle: ViewStyle[] = [
    styles.row,
    ...(borderTop
      ? [
          {
            borderTopWidth: 1,
            borderTopColor: theme.colors.divider,
          } as ViewStyle,
        ]
      : []),
    ...(borderBottom
      ? [
          {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.divider,
          } as ViewStyle,
        ]
      : []),
    // Note: no visual style for `disabled`. When a Sync source is
    // mid-switch the parent disables both rows to guard against
    // double-taps, but dimming both would misleadingly look like both
    // are being pressed. The Pressable still silently ignores taps
    // while disabled.
  ];

  return (
    <View>
      <Pressable
        style={rowStyle}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={label}
      >
        <View style={[styles.radioOuter, { borderColor: outerColor }]}>
          {selected && (
            <View
              style={[styles.radioInner, { backgroundColor: innerColor }]}
            />
          )}
        </View>
        <View style={styles.labelContainer}>
          <Text style={[typographyThemed(theme).bodyPrimary, styles.label]}>
            {label}
          </Text>
          {description && (
            <Text
              style={[
                typographyThemed(theme).captionSecondary,
                styles.description,
              ]}
            >
              {description}
            </Text>
          )}
        </View>
      </Pressable>
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const RADIO_OUTER = 22;
const RADIO_INNER = 12;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  radioOuter: {
    width: RADIO_OUTER,
    height: RADIO_OUTER,
    borderRadius: RADIO_OUTER / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Force the circle to sit at the top of the row regardless of the
    // label block's total height (label + description).
    alignSelf: 'flex-start',
    // Small nudge so the circle top doesn't sit flush against the glyph
    // top (fonts often render a hair above their reported line-box top).
    marginTop: 1,
  },
  radioInner: {
    width: RADIO_INNER,
    height: RADIO_INNER,
    borderRadius: RADIO_INNER / 2,
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    // Tighten the line-box so the glyph top aligns with the top of the
    // container (and therefore the top of the radio circle). Without
    // this the body typography's lineHeight (28) leaves ~6px of empty
    // space above the glyph inside its own line-box, making the circle
    // look like it's floating above the label.
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: 'top',
  },
  description: {
    marginTop: spacing.xs,
  },
  footer: {
    // Indent to align with the label text (past the radio circle + gap).
    paddingLeft: RADIO_OUTER + spacing.md,
  },
});
