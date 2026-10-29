import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  LinearGradientProps,
  Stop,
  Rect,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  useAnimatedProps,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../hooks/useReduceMotion';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Celebration palette: white, gold, and yellow tones
const COLORS = [
  '#FFF9C4', // Light yellow
  '#FFD54F', // Soft yellow
  '#D4AF37', // Gold
  '#FFF3CD', // Pale gold/yellow
  '#835e00', // White
];

interface CelebrationBorderProps {
  show: boolean;
  borderWidth?: number; // default 5
  opacity?: number; // overall alpha of the border
  cycleDurationMs?: number; // how fast the gradient rotates
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function CelebrationBorder({
  show,
  borderWidth = 5,
  opacity = 0.6,
  cycleDurationMs = 8000,
}: CelebrationBorderProps) {
  const reduceMotionEnabled = useReduceMotion();

  const angle = useSharedValue(0);
  const alpha = useSharedValue(0);

  React.useEffect(() => {
    cancelAnimation(angle);
    angle.value = 0;
    if (show) {
      alpha.value = withTiming(opacity, {
        duration: 240,
        easing: Easing.linear,
      });
      if (!reduceMotionEnabled) {
        angle.value = withRepeat(
          withTiming(360, { duration: cycleDurationMs, easing: Easing.linear }),
          -1,
        );
      }
    } else {
      alpha.value = withTiming(0, { duration: 240, easing: Easing.linear });
    }
  }, [show, reduceMotionEnabled, cycleDurationMs, opacity, alpha, angle]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: alpha.value,
  }));

  const toRad = Math.PI / 180;
  const cx = SCREEN_WIDTH / 2;
  const cy = SCREEN_HEIGHT / 2;
  const R =
    Math.sqrt(SCREEN_WIDTH * SCREEN_WIDTH + SCREEN_HEIGHT * SCREEN_HEIGHT) / 2; // half-diagonal
  const gradientProps = useAnimatedProps(() => {
    const theta = angle.value * toRad;
    const x1 = cx + R * Math.cos(theta);
    const y1 = cy + R * Math.sin(theta);
    const x2 = cx - R * Math.cos(theta);
    const y2 = cy - R * Math.sin(theta);
    return { x1, y1, x2, y2 } as Partial<LinearGradientProps>;
  });

  // Even when hidden, keep mounted for smooth fade in/out
  return (
    <Animated.View style={[styles.root, containerStyle]} pointerEvents="none">
      <Svg
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <AnimatedLinearGradient
            id="celebrationBorderGradient"
            gradientUnits="userSpaceOnUse"
            animatedProps={gradientProps}
          >
            {COLORS.map((c, i) => (
              <Stop
                key={i}
                offset={`${(i / (COLORS.length - 1)) * 100}%`}
                stopColor={c}
                stopOpacity={1}
              />
            ))}
          </AnimatedLinearGradient>
        </Defs>
        <Rect
          x={borderWidth / 2}
          y={borderWidth / 2}
          width={SCREEN_WIDTH - borderWidth}
          height={SCREEN_HEIGHT - borderWidth}
          fill="none"
          stroke="url(#celebrationBorderGradient)"
          strokeWidth={borderWidth}
          rx={8}
          ry={8}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
});
