/**
 * SectionHeader - Styled section title for modal content.
 */

import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { modalStyles } from '../../styles/modalStyles';

interface SectionHeaderProps {
  title: string;
}

export default function SectionHeader({ title }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        typographyThemed(theme).subtitleLargePrimary,
        modalStyles.sectionTitle,
      ]}
    >
      {title}
    </Text>
  );
}
