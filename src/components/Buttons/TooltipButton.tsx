import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useTheme } from '../../stores/settingsStore';
import { spacing, shadows } from '../../styles/global';
import Button from './Button';

interface TooltipButtonProps {
  text?: string;
  onPress: () => void;
}

const AnimatedContainer = Animated.createAnimatedComponent(View);

export default function TooltipButton({
  text = 'Get started',
  onPress,
}: TooltipButtonProps) {
  const theme = useTheme();
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 200 });
  }, [enter]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * -8 }],
  }));

  return (
    <AnimatedContainer
      style={[styles.container, animatedStyle]}
      pointerEvents="box-none"
    >
      <Button
        onPress={onPress}
        variant="outline"
        size="default"
        style={shadows.medium}
      >
        {text}
      </Button>
      <View
        style={[
          styles.caret,
          { borderBottomColor: theme.colors.buttonOutlineBorder },
        ]}
        pointerEvents="none"
      />
    </AnimatedContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    position: 'relative',
  },
  caret: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    position: 'absolute',
    top: -7,
    left: '20%',
    marginLeft: -8,
  },
});
