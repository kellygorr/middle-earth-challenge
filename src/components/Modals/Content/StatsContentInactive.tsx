import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { spacing, borderRadius } from '../../../styles/global';
import { typographyThemed } from '../../../styles/typography';
import JourneyProgressBar from '../../JourneyProgressBar';
import Section from '../Section';

/**
 * StatsContentInactive - Stats modal body shown when the user has no
 * distance entries yet. Renders:
 *
 * - A non-distracting background of section headers + grey skeleton rows
 *   (Activity, Pace & projections). No real labels — just blocks.
 * - A centered overlay card with the unlock message.
 * - The live `JourneyProgressBar` pinned at the bottom (not skeletonized)
 *   so the page has one real piece of info.
 */
export default function StatsContentInactive() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);

  const unit = useMiles ? 'mile' : 'kilometer';

  return (
    <View style={styles.wrap}>
      {/* Main area: background skeleton with the centered overlay layered
          on top of it. Kept as a single flex:1 box so the overlay's
          absolute fill is bounded *above* the bottom progress bar — that
          way the card visually centers between the modal top and the
          journey bar, not over the journey bar. */}
      <View style={styles.main}>
        <View
          style={styles.background}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <SkeletonHeader theme={theme} title="Progress" />
          <SkeletonRow theme={theme} />
          <SkeletonRow theme={theme} />
          <SkeletonRow theme={theme} isLast />

          <Section>
            <SkeletonHeader theme={theme} title="Activity" />
            <SkeletonRow theme={theme} />
            <SkeletonRow theme={theme} />
            <SkeletonRow theme={theme} />
            <SkeletonRow theme={theme} isLast />
          </Section>

          <Section>
            <SkeletonHeader theme={theme} title="Pace & projections" />
            <SkeletonRow theme={theme} />
            <SkeletonRow theme={theme} />
            <SkeletonRow theme={theme} isLast />
          </Section>
        </View>

        {/* Centered overlay card */}
        <View style={styles.center} pointerEvents="box-none">
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[
                typographyThemed(theme).subtitleLargePrimary,
                styles.title,
              ]}
            >
              Log your first {unit} to unlock stats
            </Text>
            <Text
              style={[typographyThemed(theme).bodySecondary, styles.subtitle]}
            >
              Once you have at least one tracked {unit}, you’ll see your
              progress, pace, and projected finish date here.
            </Text>
          </View>
        </View>
      </View>

      {/* Live journey progress bar pinned to the bottom */}
      <View style={styles.progress}>
        <JourneyProgressBar />
      </View>
    </View>
  );
}

/**
 * SkeletonHeader - section header rendered in a muted grey for the
 * inactive state so it doesn't pull focus from the centered unlock card.
 */
function SkeletonHeader({
  theme,
  title,
}: {
  theme: ReturnType<typeof useTheme>;
  title: string;
}) {
  return (
    <Text
      style={[
        typographyThemed(theme).subtitleLargePrimary,
        styles.skeletonHeader,
        { color: theme.colors.divider },
      ]}
    >
      {title}
    </Text>
  );
}

function SkeletonRow({
  theme,
  isLast = false,
}: {
  theme: ReturnType<typeof useTheme>;
  isLast?: boolean;
}) {
  const blockColor = theme.colors.divider;
  return (
    <View
      style={[
        styles.skeletonRow,
        !isLast && styles.skeletonRowDivider,
        !isLast && { borderBottomColor: theme.colors.divider },
      ]}
    >
      <View
        style={[
          styles.skeletonBlock,
          styles.skeletonLabel,
          { backgroundColor: blockColor },
        ]}
      />
      <View
        style={[
          styles.skeletonBlock,
          styles.skeletonValue,
          { backgroundColor: blockColor },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  main: {
    flex: 1,
    position: 'relative',
  },
  background: {
    flex: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  progress: {
    paddingTop: spacing.md,
  },
  skeletonHeader: {
    marginBottom: spacing.md,
    opacity: 0.6,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skeletonRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonBlock: {
    height: 12,
    borderRadius: borderRadius.sm,
    opacity: 0.6,
  },
  skeletonLabel: {
    width: '40%',
  },
  skeletonValue: {
    width: '25%',
  },
});
