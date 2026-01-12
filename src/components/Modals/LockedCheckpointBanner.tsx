import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typography } from '../../styles/typography';
import { spacing, borderRadius, iconSizes } from '../../styles/global';
import { LockIcon } from '../../assets/icons';

export function LockedCheckpointBanner() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.infoModalInactive },
      ]}
    >
      <View style={styles.content}>
        <Text
          style={[
            typography.caption,
            styles.text,
            { color: theme.colors.checkpointLabel },
          ]}
        >
          Checkpoint
        </Text>
        <LockIcon size={iconSizes.small} color={theme.colors.checkpointLabel} />
      </View>
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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  text: {
    textAlign: 'center',
  },
});
