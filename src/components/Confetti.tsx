import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, AccessibilityInfo } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../styles/motion';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  swayAmount: number;
  initialRotation: number;
}

interface ConfettiProps {
  show: boolean;
}

// Confetti colors
const CONFETTI_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#FFB347', // Orange
  '#98D8C8', // Mint
];

// Generate random confetti pieces
const generateConfetti = (): ConfettiPiece[] => {
  const pieces: ConfettiPiece[] = [];
  const pieceCount = 75;

  for (let i = 0; i < pieceCount; i++) {
    pieces.push({
      id: i,
      x: Math.random() * SCREEN_WIDTH,
      color:
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      delay: Math.random() * motion.confetti.startStaggerMax, // Stagger
      duration:
        motion.confetti.fallDurationMin +
        Math.random() *
          (motion.confetti.fallDurationMax - motion.confetti.fallDurationMin),
      swayAmount: 20 + Math.random() * 20, // 20-40px sway for subtle motion
      initialRotation: Math.random() * 360, // Random starting rotation
    });
  }

  return pieces;
};

const ConfettiPiece: React.FC<{
  piece: ConfettiPiece;
  show: boolean;
}> = ({ piece, show }) => {
  const translateY = useSharedValue(-20);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const startAnimation = () => {
      // Initial setup
      translateY.value = -20;
      translateX.value = 0;
      opacity.value = 1;
      scale.value = 1;
      rotation.value = piece.initialRotation;

      // Fall animation (go well past the bottom to ensure full-screen travel)
      translateY.value = withTiming(SCREEN_HEIGHT + 300, {
        duration: piece.duration,
        easing: motion.easing.standard,
      });

      // Simpler horizontal sway animation
      translateX.value = withTiming(piece.swayAmount, {
        duration: piece.duration,
        easing: motion.easing.sway,
      });

      // Slower rotation for calmer effect
      rotation.value = withTiming(piece.initialRotation + 90, {
        duration: piece.duration,
        easing: motion.easing.linear,
      });

      // Fade out after the fall completes (small buffer so it reaches bottom)
      setTimeout(() => {
        opacity.value = withTiming(0, {
          duration: motion.confetti.fadeOutDuration,
        });
        scale.value = withTiming(0, {
          duration: motion.confetti.fadeOutDuration,
        });
      }, piece.duration + 120);
    };

    if (show) {
      setTimeout(startAnimation, piece.delay);
    }
  }, [
    show,
    piece.delay,
    piece.duration,
    piece.swayAmount,
    opacity,
    rotation,
    scale,
    translateX,
    translateY,
    piece.initialRotation,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: translateY.value },
        { translateX: translateX.value },
        { rotate: `${rotation.value}deg` },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          left: piece.x,
          backgroundColor: piece.color,
        },
        animatedStyle,
      ]}
    />
  );
};

export default function Confetti({ show }: ConfettiProps) {
  const confettiPieces = React.useMemo(() => generateConfetti(), []);
  const [reduceMotionEnabled, setReduceMotionEnabled] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );
    return () => {
      mounted = false;
      // RN versions differ; guard for remove
      // @ts-ignore
      sub?.remove?.();
    };
  }, []);

  if (!show || reduceMotionEnabled) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {confettiPieces.map(piece => (
        <ConfettiPiece key={piece.id} piece={piece} show={show} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  confettiPiece: {
    position: 'absolute',
    width: 8,
    height: 8,
  },
});
