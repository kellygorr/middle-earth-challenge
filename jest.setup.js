// Jest setup file
import 'react-native-gesture-handler/jestSetup';

// Mock reanimated - full mock without requiring the package
const mockReanimated = {
  call: () => {},
  createAnimatedComponent: component => component,
  Value: jest.fn(),
  event: jest.fn(),
  add: jest.fn(),
  eq: jest.fn(),
  set: jest.fn(),
  cond: jest.fn(),
  interpolate: jest.fn(),
  View: 'Animated.View',
  ScrollView: 'Animated.ScrollView',
  FlatList: 'Animated.FlatList',
  timing: jest.fn(),
  spring: jest.fn(),
  decay: jest.fn(),
  sequence: jest.fn(),
  parallel: jest.fn(),
};

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: mockReanimated,
  ...mockReanimated,
  useSharedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedStyle: jest.fn(() => ({})),
  useDerivedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedProps: jest.fn(() => ({})),
  withTiming: jest.fn(toValue => toValue),
  withSpring: jest.fn(toValue => toValue),
  withDelay: jest.fn((_, animation) => animation),
  withSequence: jest.fn(),
  withRepeat: jest.fn(),
  cancelAnimation: jest.fn(),
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
    bezier: jest.fn(() => jest.fn()),
    in: jest.fn(() => jest.fn()),
    out: jest.fn(() => jest.fn()),
    inOut: jest.fn(() => jest.fn()),
    cubic: jest.fn(),
  },
  Extrapolation: {
    CLAMP: 'clamp',
  },
  interpolate: jest.fn(),
  runOnJS: jest.fn(fn => fn),
  runOnUI: jest.fn(fn => fn),
}));

// Mock op-sqlite
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    executeAsync: jest.fn(() => Promise.resolve({ rows: [] })),
    close: jest.fn(),
  })),
}));

// Mock Skia
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas',
  Path: 'Path',
  Group: 'Group',
  Skia: {
    Path: {
      MakeFromSVGString: jest.fn(() => ({})),
    },
  },
  useFont: jest.fn(),
  useDerivedValue: jest.fn(() => ({ value: 0 })),
}));
