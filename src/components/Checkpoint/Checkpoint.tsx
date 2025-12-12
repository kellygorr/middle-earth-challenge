import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typography } from '../../styles/typography';

interface CheckpointProps {
  x: number;
  y: number;
  name: string;
  isActive: boolean;
  showLabel: boolean;
  onPress?: () => void;
}

export default function Checkpoint({
  x,
  y,
  name,
  isActive,
  showLabel,
  onPress,
}: CheckpointProps) {
  const theme = useTheme();

  const color = isActive
    ? theme.colors.checkpointUnlocked
    : theme.colors.checkpointLocked;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          left: x,
          top: y,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Outer circle */}
      <View
        style={[
          styles.outerCircle,
          {
            borderColor: color,
          },
        ]}
      >
        {/* Inner circle */}
        <View
          style={[
            styles.innerCircle,
            {
              backgroundColor: color,
            },
          ]}
        />
      </View>

      {/* Checkpoint name */}
      {showLabel && (
        <View
          style={[
            styles.nameContainer,
            {
              backgroundColor: theme.colors.checkpointTextBackground,
            },
          ]}
        >
          <Text
            style={[
              typography.label,
              {
                color: theme.colors.checkpointText,
              },
            ]}
          >
            {name}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -12, // Center the bullseye on the coordinates
    marginTop: -12,
  },
  outerCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  innerCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nameContainer: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
