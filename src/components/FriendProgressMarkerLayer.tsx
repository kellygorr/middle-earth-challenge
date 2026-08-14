import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

const KELLY_MARKER_COLOR = '#D4AF37';

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
          expanded ? styles.bubble : styles.locationPin,
          expanded
            ? {
                backgroundColor: theme.colors.surface,
                borderColor: markerColor,
              }
            : { backgroundColor: markerColor },
        ]}
      >
        {expanded ? (
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
        ) : isLeader ? (
          <StarIcon size={16} />
        ) : (
          <View style={styles.locationPinCenter} />
        )}
      </Pressable>
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
              ? KELLY_MARKER_COLOR
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
    borderColor: '#FFFFFF',
    borderRadius: 12,
    borderBottomLeftRadius: 2,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    transform: [{ translateX: -12 }, { translateY: -28 }, { rotate: '-45deg' }],
    width: 24,
    ...shadows.small,
  },
  locationPinCenter: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.full,
    height: 7,
    width: 7,
  },
  bubble: {
    borderWidth: 2,
    borderRadius: borderRadius.md,
    maxWidth: 190,
    minWidth: 120,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    transform: [{ translateX: -12 }, { translateY: -44 }],
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
