import React from 'react';
import { View, StyleSheet } from 'react-native';
import PlusIcon from '../assets/icons/PlusIcon';
import { useTheme } from '../stores/settingsStore';

interface CirclePlusIconProps {
  size?: number;
  // Accepted for compatibility with InlineIconLink's generic icon prop
  // contract, but intentionally ignored: this badge is a fixed two-tone
  // treatment (brand circle + inverted glyph) matching the map's
  // add-miles button, not a themed outline icon that should recolor to
  // match surrounding text.
  color?: string;
}

/**
 * Small circled "+" badge matching the map's add-miles button. Pass as
 * InlineIconLink's `icon` prop wherever body copy references that button
 * (e.g. "...add it with the + icon.").
 */
export default function CirclePlusIcon({ size = 12 }: CirclePlusIconProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.buttonPrimaryBackground,
        },
      ]}
    >
      <PlusIcon size={size * (2 / 3)} color={theme.colors.iconInverted} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
