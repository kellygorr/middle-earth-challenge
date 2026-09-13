import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, borderRadius, iconSizes } from '../../styles/global';
import { LockIcon } from '../../assets/icons';

interface LockedCheckpointBannerProps {
  // Pre-authored teaser (checkpoints.json's description.teaser) shown as
  // faded text at the top of the block, only for the immediate-next
  // locked checkpoint. The "Checkpoint" + lock icon stay centered below it
  // exactly as they are for every other locked checkpoint.
  teaser?: string | null;
}

export function LockedCheckpointBanner({
  teaser,
}: LockedCheckpointBannerProps = {}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        // Only the immediate-next locked checkpoint (with a teaser) gets
        // the transparent-to-grey "reveal" gradient background — every
        // other locked checkpoint stays a plain flat grey fill.
        !teaser && { backgroundColor: theme.colors.infoModalInactive },
      ]}
    >
      {teaser && (
        <>
          {/* Transparent-to-grey gradient background (top to bottom)
              instead of a flat fill, so the block reads as something
              gradually being "revealed" rather than a solid wall. */}
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient
                id="lockedCheckpointGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop
                  offset="0"
                  stopColor={theme.colors.infoModalInactive}
                  stopOpacity={0}
                />
                <Stop
                  offset="1"
                  stopColor={theme.colors.infoModalInactive}
                  stopOpacity={1}
                />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx={borderRadius.md}
              ry={borderRadius.md}
              fill="url(#lockedCheckpointGradient)"
            />
          </Svg>
          <Text style={[typographyThemed(theme).bodyPrimary, styles.teaser]}>
            {teaser}
          </Text>
        </>
      )}
      <View style={styles.content}>
        <Text
          style={[
            typographyThemed(theme).caption,
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
    overflow: 'hidden',
  },
  teaser: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    textAlign: 'left',
    lineHeight: 22,
    opacity: 0.1,
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
