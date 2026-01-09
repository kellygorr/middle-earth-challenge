/**
 * TriviaListItem - Pressable row showing trivia name and cumulative miles.
 */

import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';
import { formatDistance } from '../../utils/date';

interface TriviaListItemProps {
  /** Trivia name */
  name: string;
  /** Cumulative miles to this trivia point */
  miles: number;
  /** Press handler */
  onPress: () => void;
}

export default function TriviaListItem({
  name,
  miles,
  onPress,
}: TriviaListItemProps) {
  const theme = useTheme();

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={[typographyThemed(theme).bodySecondary, styles.name]}>
        {name}
      </Text>
      <Text style={[typographyThemed(theme).bodySecondary, styles.miles]}>
        {formatDistance(miles, true)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    marginRight: spacing.sm,
  },
  miles: {
    textAlign: 'right',
  },
});
