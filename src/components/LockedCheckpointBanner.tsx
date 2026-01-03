import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing, borderRadius } from '../styles/global';

export function LockedCheckpointBanner() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.infoModalInactive },
      ]}
    >
      <Text
        style={[
          typography.caption,
          styles.text,
          { color: theme.colors.checkpointLabel },
        ]}
      >
        Checkpoint locked
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
  },
  text: {
    textAlign: 'center',
  },
});
