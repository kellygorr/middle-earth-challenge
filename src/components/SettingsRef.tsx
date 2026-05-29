/**
 * SettingsRef - Inline reference to the in-app Settings screen.
 *
 * Renders the gear icon + the word "Settings" as inline content within a
 * parent `<Text>`. MUST be used inside a `<Text>` so RN can flow the icon
 * with the surrounding copy and wrap naturally.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SettingsIcon } from '../assets/icons';

interface SettingsRefProps {
  /** Pixel size for the icon. Defaults to 14 to sit on body-text baseline. */
  size?: number;
  /** Override icon + text color. Defaults to inherited text color. */
  color?: string;
}

export default function SettingsRef({ size = 14, color }: SettingsRefProps) {
  return (
    <>
      <View style={[styles.iconWrap, { width: size, height: size }]}>
        <SettingsIcon size={size} color={color} />
      </View>
      <Text style={color ? { color } : undefined}> Settings</Text>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    // Nudge the icon down a hair so it visually sits on the text baseline.
    transform: [{ translateY: 2 }],
  },
});
