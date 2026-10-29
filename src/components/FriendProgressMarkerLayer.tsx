import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Skia } from '@shopify/react-native-skia';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import { StarIcon } from '../assets/icons';
import { getFriendAffinityColor } from '../constants/friendAffinities';
import { GAME_PATH } from '../constants/mapPathData';
import {
  type FriendProgressMapParticipant,
  useFriendProgressStore,
} from '../stores/friendProgressStore';
import { useSettingsStore, useTheme } from '../stores/settingsStore';
import { borderRadius, shadows, spacing } from '../styles/global';
import { typographyThemed } from '../styles/typography';
import { formatDistance } from '../utils/date';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';

// Gap between the marker pin's anchor point and the top of the info
// tooltip rendered below it.
const TOOLTIP_GAP = 8;
// Matches the tooltip's own `minWidth` — used as the centering guess for
// the single frame before its real width is measured via onLayout, so the
// initial position is already close instead of visibly snapping over.
const TOOLTIP_DEFAULT_WIDTH = 120;

interface ParticipantPosition extends FriendProgressMapParticipant {
  x: number;
  y: number;
}

interface PositionedParticipantMarkerProps {
  participant: ParticipantPosition;
  markerColor: string;
  isLeader: boolean;
  centerX: number;
  centerY: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  expanded: boolean;
  onPress: () => void;
}

function PositionedParticipantMarker({
  participant,
  markerColor,
  isLeader,
  centerX,
  centerY,
  translateX,
  translateY,
  scale,
  expanded,
  onPress,
}: PositionedParticipantMarkerProps) {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const [tooltipWidth, setTooltipWidth] = useState(TOOLTIP_DEFAULT_WIDTH);
  const journeyPercentage = Math.round(
    Math.min(1, Math.max(0, participant.distanceMiles / TOTAL_JOURNEY_MILES)) *
      100,
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          translateX.value + centerX + (participant.x - centerX) * scale.value,
      },
      {
        translateY:
          translateY.value + centerY + (participant.y - centerY) * scale.value,
      },
    ],
  }));

  const handleTooltipLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== tooltipWidth) setTooltipWidth(width);
  };

  return (
    <Animated.View
      style={[
        styles.positionedMarker,
        expanded && styles.expandedMarker,
        animatedStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${participant.displayName}, ${formatDistance(
          participant.distanceMiles,
          { includeUnits: true, useLargeUnit: true, useMiles },
        )}, ${journeyPercentage}% complete`}
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={[
          styles.locationPin,
          {
            borderColor: theme.colors.iconInverted,
            backgroundColor: markerColor,
          },
        ]}
      >
        {isLeader ? (
          <StarIcon size={16} color={theme.colors.iconInverted} />
        ) : (
          <View
            style={[
              styles.locationPinCenter,
              { backgroundColor: theme.colors.iconInverted },
            ]}
          />
        )}
      </Pressable>

      {expanded && (
        // Positioned independently of the pin above (not swapped in for
        // it) so the pin stays visible while this tooltip shows beneath
        // it. Centered under the pin's anchor point via onLayout — the
        // tooltip's width varies with its content (display name length),
        // so a fixed offset can't center it; only a measured one can.
        <Pressable
          onPress={onPress}
          onLayout={handleTooltipLayout}
          style={[
            styles.bubble,
            {
              backgroundColor: theme.colors.surface,
              borderColor: markerColor,
              transform: [
                { translateX: -tooltipWidth / 2 },
                { translateY: TOOLTIP_GAP },
              ],
            },
          ]}
        >
          <View style={styles.bubbleContent}>
            {participant.markerMessage ? (
              <Text style={typographyThemed(theme).captionPrimaryBold}>
                {participant.markerMessage}
              </Text>
            ) : (
              <>
                <Text
                  numberOfLines={1}
                  style={typographyThemed(theme).captionPrimaryBold}
                >
                  {participant.displayName}
                </Text>
                <View style={styles.progressRow}>
                  <Text style={typographyThemed(theme).captionSecondary}>
                    {formatDistance(participant.distanceMiles, {
                      includeUnits: true,
                      useLargeUnit: true,
                      useMiles,
                    })}
                  </Text>
                  <Text style={typographyThemed(theme).captionSecondary}>
                    {`${journeyPercentage}%`}
                  </Text>
                </View>
              </>
            )}
          </View>
        </Pressable>
      )}
    </Animated.View>
  );
}

interface FriendProgressMarkerLayerProps {
  participants: FriendProgressMapParticipant[];
  uniformScale: number;
  mapOffsetX: number;
  mapOffsetY: number;
  centerX: number;
  centerY: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
}

export default function FriendProgressMarkerLayer({
  participants,
  uniformScale,
  mapOffsetX,
  mapOffsetY,
  centerX,
  centerY,
  translateX,
  translateY,
  scale,
}: FriendProgressMarkerLayerProps) {
  const theme = useTheme();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const leaderUserId = useMemo(
    () =>
      participants.reduce<FriendProgressMapParticipant | null>(
        (leader, participant) =>
          !leader || participant.distanceMiles > leader.distanceMiles
            ? participant
            : leader,
        null,
      )?.userId ?? null,
    [participants],
  );
  const positionedParticipants = useMemo(() => {
    const path = Skia.Path.MakeFromSVGString(GAME_PATH);
    if (!path) return [];

    const contour = Skia.ContourMeasureIter(path, false, 1).next();
    if (!contour) return [];

    return participants.map(participant => {
      const progress = mapBookMilesToPathProgress(participant.distanceMiles);
      const [position] = contour.getPosTan(contour.length() * progress);
      return {
        ...participant,
        x: position.x * uniformScale - mapOffsetX,
        y: position.y * uniformScale - mapOffsetY,
      };
    });
  }, [participants, uniformScale, mapOffsetX, mapOffsetY]);

  return (
    <>
      {positionedParticipants.map(participant => (
        <PositionedParticipantMarker
          key={participant.userId}
          participant={participant}
          isLeader={participant.userId === leaderUserId}
          markerColor={
            participant.dismissOnExpandedPress
              ? theme.colors.celebrationAccent
              : getFriendAffinityColor(participant.affinity, theme)
          }
          centerX={centerX}
          centerY={centerY}
          translateX={translateX}
          translateY={translateY}
          scale={scale}
          expanded={expandedUserId === participant.userId}
          onPress={() => {
            const isExpanded = expandedUserId === participant.userId;
            if (isExpanded && participant.dismissOnExpandedPress) {
              useFriendProgressStore.getState().dismissKelly();
              setExpandedUserId(null);
              return;
            }
            setExpandedUserId(isExpanded ? null : participant.userId);
          }}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  positionedMarker: {
    position: 'absolute',
  },
  expandedMarker: {
    elevation: 10,
    zIndex: 10,
  },
  locationPin: {
    alignItems: 'center',
    borderRadius: 12,
    borderBottomLeftRadius: 2,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    transform: [{ translateX: -12 }, { translateY: -28 }, { rotate: '-45deg' }],
    width: 24,
    ...shadows.small,
  },
  locationPinCenter: {
    borderRadius: borderRadius.full,
    height: 7,
    width: 7,
  },
  bubble: {
    borderWidth: 2,
    borderRadius: borderRadius.md,
    left: 0,
    maxWidth: 190,
    minWidth: 120,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: 0,
    ...shadows.medium,
  },
  bubbleContent: {
    gap: spacing.xs,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
