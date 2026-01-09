/**
 * SectionHeader - Styled section title for modal content.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';

interface SectionHeaderProps {
  title: string;
}

export default function SectionHeader({ title }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <Text style={[typographyThemed(theme).subtitleLargePrimary, styles.title]}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.md,
  },
});
