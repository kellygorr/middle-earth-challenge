# iOS Modal Fixes

This document describes iOS-specific fixes for React Native Modal components. These changes are critical for iOS stability and should not be reverted.

## Background

React Native's `<Modal>` component has known issues on iOS:

1. **GitHub Issue #48611**: Opening a modal while another is closing causes the second modal to fail to render
2. **SafeAreaProvider Context**: iOS Modals render in a separate native window, so they don't inherit the SafeAreaProvider context from the app root

## Fixes Applied

### 1. SafeAreaProvider Inside Each Modal

**Problem**: `useSafeAreaInsets()` returns `{top: 0, bottom: 0}` on first render inside iOS Modals because the Modal creates a new native window that doesn't inherit the root SafeAreaProvider context.

**Solution**: Wrap Modal content with its own `SafeAreaProvider` using `initialWindowMetrics`:

```tsx
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

<Modal visible={visible} transparent statusBarTranslucent>
  <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'bottom']}>{/* Modal content */}</SafeAreaView>
  </SafeAreaProvider>
</Modal>;
```

**Files affected**:

- `src/components/Modals/ModalWrapper.tsx` - Used by Settings, Stats, Miles, Sync modals
- `src/components/Modals/InfoModal.tsx` - Checkpoint/trivia modal
- `src/components/Modals/WelcomeModal.tsx` - Welcome screen modal

### 2. Avoid Double Padding

**Problem**: If you calculate `containerHeight` using `useSafeAreaInsets()` AND use `SafeAreaView` with `edges={['top', 'bottom']}`, you get double padding.

**Solution**:

- Let `SafeAreaView` handle all safe area padding
- Don't subtract insets from container height calculations
- Only use horizontal padding on the overlay (not vertical)

```tsx
// ✅ CORRECT: SafeAreaView handles vertical safe areas
const containerHeight = windowHeight * modalConstants.portraitHeightRatio;

// In modalStyles.ts:
overlay: {
  paddingHorizontal: spacing.lg,  // Only horizontal padding
},
```

### 3. Modal Transition Delays (500ms)

**Problem**: iOS cannot open a new modal while another is still animating closed. Attempting to do so causes the app to freeze or the new modal to not appear.

**Solution**: When transitioning from one modal to another, dismiss the first modal and wait 500ms before opening the second:

```tsx
const handleOpenNewModal = () => {
  onDismiss();
  setTimeout(() => {
    openOtherModal();
  }, 500);
};
```

**Cases requiring delay**:

- Settings → Welcome (Home button): `SettingsModal.tsx` `handleHomePress`
- Welcome → Sync (Reconnect button): `WelcomeModal.tsx` `handleReconnect`
- InfoModal → Miles (Add miles button): `TrackingOptions.tsx` manual add button

### 4. Modal Overlay Pattern (No Delay Needed)

**Problem**: Some modals should appear on top of others without dismissing the parent.

**Solution**: Render the child modal **inside** the parent's `SafeAreaProvider`, not as a sibling:

```tsx
// ✅ CORRECT: Child modal inside parent's SafeAreaProvider
<Modal visible={parentVisible}>
  <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    {/* Parent modal content */}
    <ChildModal visible={childVisible} onDismiss={...} />
  </SafeAreaProvider>
</Modal>
```

**Files using overlay pattern**:

- `SettingsModal.tsx` → `SyncModal` (sync options overlay)
- `InfoModal.tsx` → `SyncModal` (sync options overlay)

## Summary Table

| Transition Type                | Example                           | Solution                       |
| ------------------------------ | --------------------------------- | ------------------------------ |
| Modal A closes → Modal B opens | Home button, Reconnect, Add miles | 500ms delay                    |
| Modal B overlays Modal A       | Sync over Settings/Info           | Render inside SafeAreaProvider |
| Modal opens from non-modal     | Map → Any modal                   | No special handling            |

## Testing Checklist

When modifying modal code, test on iOS simulator:

- [ ] Opening checkpoint modal shows title below Dynamic Island
- [ ] Settings → Home button → Welcome modal appears
- [ ] Welcome modal → Reconnect → Sync modal appears
- [ ] Checkpoint → Add miles → Miles modal appears
- [ ] Checkpoint → Sync button → Sync modal overlays checkpoint
- [ ] Settings → Sync toggle → Sync modal overlays settings
- [ ] All modals dismiss correctly with X button or backdrop tap
- [ ] No double padding on any modal (title not too far from top)

## References

- [React Native GitHub Issue #48611](https://github.com/facebook/react-native/issues/48611)
- [react-native-safe-area-context Modal usage](https://github.com/th3rdwave/react-native-safe-area-context#usage-with-modals)
