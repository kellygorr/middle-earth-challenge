/**
 * ToggleRow - A row with label on left and control on right.
 * Supports Switch, Button, or custom right element.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconButtonSizes, borderRadius } from '../../styles/global';

interface ToggleRowProps {
  /** Primary label text */
  label: string;
  /** Optional secondary caption below label */
  caption?: string;
  /** Switch value (renders Switch if provided) */
  value?: boolean;
  /** Switch onChange handler */
  onValueChange?: (value: boolean) => void;
  /** Whether Switch is disabled */
  disabled?: boolean;
  /** Custom right element (overrides Switch) */
  rightElement?: React.ReactNode;
  /** Icon element to show on left */
  icon?: React.ReactNode;
  /** Press handler for the entire row (excluding Switch) */
  onPress?: () => void;
  /** Show border on bottom */
  borderBottom?: boolean;
  /** Show border on top */
  borderTop?: boolean;
}

export default function ToggleRow({
  label,
  caption,
  value,
  onValueChange,
  disabled,
  rightElement,
  icon,
  onPress,
  borderBottom,
  borderTop,
}: ToggleRowProps) {
  const theme = useTheme();

  const renderSwitch = () => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{
        false: theme.colors.switchInactive,
        true: theme.colors.buttonPrimary,
      }}
      thumbColor={theme.colors.surface}
    />
  );

  const content = (
    <>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <View style={styles.labelContainer}>
        <Text style={typographyThemed(theme).bodyPrimary}>{label}</Text>
        {caption && (
          <Text style={typographyThemed(theme).captionSecondary}>
            {caption}
          </Text>
        )}
      </View>
      {rightElement ?? (value !== undefined && renderSwitch())}
    </>
  );

  const rowStyle: ViewStyle[] = [
    styles.row,
    ...(icon ? [styles.rowWithGap] : []),
    ...(borderBottom
      ? [
          {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.divider,
          } as ViewStyle,
        ]
      : []),
    ...(borderTop
      ? [
          {
            borderTopWidth: 1,
            borderTopColor: theme.colors.divider,
          } as ViewStyle,
        ]
      : []),
  ];

  if (onPress) {
    return (
      <Pressable style={rowStyle} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={rowStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowWithGap: {
    gap: spacing.md,
  },
  labelContainer: {
    flex: 1,
  },
  iconContainer: {
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
  },
});
