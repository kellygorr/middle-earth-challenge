/**
 * EmptyState - Centered message displayed when no data is available.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';

interface EmptyStateProps {
  /** Message to display */
  message: string;
  /** Optional children (e.g., progress bar, CTA buttons) */
  children?: React.ReactNode;
}

export default function EmptyState({ message, children }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.messageContainer}>
        <Text style={[typographyThemed(theme).bodySecondary, styles.message]}>
          {message}
        </Text>
      </View>
      {children && <View style={styles.childrenContainer}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
  },
  childrenContainer: {
    width: '100%',
    paddingBottom: spacing.md,
  },
});
