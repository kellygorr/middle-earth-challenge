/**
 * InlineIconLink - Generic inline icon + label reference, used within body
 * copy to point users at another part of the app (e.g. "...delete data in
 * [gear icon] Settings").
 *
 * Renders as inline content within a parent `<Text>`. MUST be used inside a
 * `<Text>` so RN can flow the icon with the surrounding copy and wrap
 * naturally.
 *
 * Optionally pressable: pass `onPress` (typically a `pushModal(...)` call)
 * to make the icon + label jump straight to the referenced screen instead
 * of just being a visual reference. The icon is a `View` (not `Text`), so
 * it can't share a single `onPress` with the trailing label `Text` the way
 * plain nested `<Text>` could — both are wrapped individually (`Pressable`
 * for the icon, `Text`'s own `onPress` for the label) so the whole visual
 * unit is tappable.
 *
 * Deliberately not underlined even when pressable — the icon + bolded
 * context already signals "this is a place in the app", and an
 * always-visible link underline was decided to be unnecessary visual
 * noise: curious users will still find it tappable.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../stores/settingsStore';

interface IconComponentProps {
  size?: number;
  color?: string;
}

interface InlineIconLinkProps {
  /** Icon component to render, e.g. `SettingsIcon` from '../assets/icons'. */
  icon: React.ComponentType<IconComponentProps>;
  /** Label text rendered after the icon, e.g. "Settings". */
  label: string;
  /** Pixel size for the icon. Defaults to 14 to sit on body-text baseline. */
  size?: number;
  /**
   * Icon color. Defaults to `theme.colors.textPrimary` — unlike the
   * trailing label <Text>, the icon is a raw SVG that does NOT inherit
   * color from the surrounding <Text> tree, so leaving this undefined
   * would pass `fill={undefined}` straight to the SVG Path and render
   * nothing at all (confirmed: this was exactly why the gear icon
   * disappeared in call sites that didn't pass an explicit color, e.g.
   * FriendProgressContent and SyncContentAndroid, while call sites that
   * did pass one, like WelcomeModal, rendered fine). Independent from
   * `textColor` — the icon stays visually consistent even when the
   * trailing label needs to match a differently-colored surrounding
   * sentence (e.g. captionSecondary body text).
   */
  iconColor?: string;
  /**
   * Trailing label text color. Defaults to `theme.colors.textPrimary`,
   * but should usually be overridden to match whatever <Text> this is
   * nested inside (e.g. `theme.colors.textSecondary` next to
   * captionSecondary body copy) so the label doesn't stand out as a
   * different color from the rest of the sentence.
   */
  textColor?: string;
  /**
   * When provided, makes the icon + label tappable (navigates to the
   * referenced screen). Omit to keep this as a plain, non-interactive
   * inline reference.
   */
  onPress?: () => void;
  /** Accessibility label for the pressable icon, e.g. "Open Settings". */
  accessibilityLabel?: string;
}

export default function InlineIconLink({
  icon: Icon,
  label,
  size = 14,
  iconColor,
  textColor,
  onPress,
  accessibilityLabel,
}: InlineIconLinkProps) {
  const theme = useTheme();
  const resolvedIconColor = iconColor ?? theme.colors.textPrimary;
  const resolvedTextColor = textColor ?? theme.colors.textPrimary;
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        hitSlop={6}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? accessibilityLabel : undefined}
      >
        <View style={[styles.iconWrap, { width: size, height: size }]}>
          <Icon size={size} color={resolvedIconColor} />
        </View>
      </Pressable>
      <Text style={{ color: resolvedTextColor }} onPress={onPress}>
        {' '}
        {label}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    // Nudge the icon down a hair so it visually sits on the text baseline.
    transform: [{ translateY: 2 }],
  },
});
