import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { borderRadius, spacing } from '../styles/global';
import { typographyThemed } from '../styles/typography';
import { useTheme } from '../stores/settingsStore';

interface ErrorMessageBannerProps {
  message: string;
  title?: string;
}

export default function ErrorMessageBanner({
  message,
  title = 'Something went wrong',
}: ErrorMessageBannerProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderLeftColor: theme.colors.uiWarning,
        },
      ]}
    >
      <Text
        style={[
          typographyThemed(theme).bodyPrimary,
          styles.title,
          { color: theme.colors.textPrimary },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          typographyThemed(theme).body,
          { color: theme.colors.textPrimary },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  title: {
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
});
