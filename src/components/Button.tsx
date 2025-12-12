import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing, borderRadius } from '../styles/global';

interface ButtonProps {
  onPress: () => void;
  children: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export default function Button({
  onPress,
  children,
  variant = 'primary',
  disabled = false,
}: ButtonProps) {
  const theme = useTheme();

  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: isPrimary
            ? theme.colors.buttonPrimary
            : theme.colors.surface,
          borderColor: theme.colors.buttonPrimary,
          borderWidth: isPrimary ? 0 : 2,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
    >
      <Text
        style={[
          typography.button,
          {
            color: isPrimary
              ? theme.colors.buttonText
              : theme.colors.textPrimary,
          },
        ]}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
