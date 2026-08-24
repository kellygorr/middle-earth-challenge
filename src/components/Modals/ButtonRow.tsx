import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, borderRadius, iconButtonSizes } from '../../styles/global';
import { IconButton } from '../Buttons';

interface ButtonRowProps {
  /** Glyph rendered inside the circular button on the left. */
  icon: React.ReactNode;
  /**
   * Drives the button styling for rows representing something that can be on
   * or off (sync, sharing). Omit for rows that are always the same.
   */
  active?: boolean;
  /** Used when `active` is not supplied. */
  iconVariant?: 'primary' | 'outline' | 'brand';
  /** Omit for caption-only rows such as the checkpoint tracking options. */
  label?: string;
  caption: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  borderTop?: boolean;
  borderBottom?: boolean;
  compact?: boolean;
}

/**
 * Circular icon button plus text, used for rows that perform an action --
 * opening a modal, toggling a source, or jumping into settings.
 *
 * Each of these was previously assembled by hand from the same set of style
 * names, so omitting one silently misaligned that row with no type error.
 */
export default function ButtonRow({
  icon,
  active,
  iconVariant = 'primary',
  label,
  caption,
  onPress,
  disabled = false,
  borderTop = false,
  borderBottom = false,
  compact = false,
}: ButtonRowProps) {
  const theme = useTheme();

  const variant =
    active === undefined ? iconVariant : active ? 'brand' : 'outline';

  const content = (
    <>
      <View style={styles.iconContainer}>
        <IconButton icon={icon} variant={variant} disabled={disabled} />
      </View>
      <View style={styles.textCol}>
        {label !== undefined && (
          <Text style={typographyThemed(theme).bodyPrimary}>{label}</Text>
        )}
        {typeof caption === 'string' ? (
          <Text style={typographyThemed(theme).captionSecondary}>
            {caption}
          </Text>
        ) : (
          caption
        )}
      </View>
    </>
  );

  const rowStyle = [
    styles.row,
    compact && styles.rowCompact,
    borderTop && [styles.borderTop, { borderTopColor: theme.colors.divider }],
    borderBottom && [
      styles.borderBottom,
      { borderBottomColor: theme.colors.divider },
    ],
    disabled && styles.disabled,
  ];

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }

  return (
    <Pressable style={rowStyle} onPress={onPress} disabled={disabled}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowCompact: {
    paddingVertical: spacing.sm,
  },
  borderTop: {
    borderTopWidth: 1,
  },
  borderBottom: {
    borderBottomWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  iconContainer: {
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
  },
  textCol: {
    flex: 1,
    flexShrink: 1,
  },
});
