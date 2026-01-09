# Keyboard-Aware Scrolling for Inverted FlatList

## The Problem

When editing an entry in an inverted FlatList (like a chat or log view), the keyboard covers the input field. We need to scroll the list so the field being edited is visible above the keyboard.

## Scope: When Does This Apply?

| Scenario                 | This Solution? | Notes                                                                            |
| ------------------------ | -------------- | -------------------------------------------------------------------------------- |
| **Inverted FlatList**    | ✅ Yes         | Primary use case - scroll direction is reversed                                  |
| **Normal FlatList**      | ⚠️ Partially   | Same concepts, but scroll direction is opposite (increase offset to scroll down) |
| **ScrollView**           | ⚠️ Partially   | Same measurement approach works, but use `scrollTo` instead of `scrollToOffset`  |
| **KeyboardAvoidingView** | ❌ No          | Use that instead if the whole screen can shift up                                |
| **Single input**         | ❌ No          | Just use `KeyboardAvoidingView` or padding                                       |

### Why Inverted FlatList Is Special

1. **Reversed scroll direction**: `offset = 0` is the visual bottom, increasing offset scrolls UP
2. **Content grows upward**: New items appear at the bottom (offset 0), old items are at higher offsets
3. **ScrollToIndex doesn't work reliably**: After scrolling, indices don't correspond to positions
4. **KeyboardAvoidingView doesn't help**: It shifts the whole view, but can't scroll within the list

## Why This Was Hard

### 1. Inverted FlatList Coordinates Are Counterintuitive

- `contentOffset.y = 0` is the **visual bottom** (most recent items)
- Increasing scroll offset moves content **up** visually
- To bring something into view from behind the keyboard, you need to **decrease** the offset

### 2. Multiple Coordinate Systems

| System              | Description                                                     | When to Use              |
| ------------------- | --------------------------------------------------------------- | ------------------------ |
| Layout coordinates  | `onLayout` gives position relative to parent container          | ❌ Not useful alone      |
| Content coordinates | Position within the scrollable content                          | ❌ Changes as you scroll |
| Screen coordinates  | Position on the actual device screen (`pageY` from `measure()`) | ✅ What we need          |

### 3. What We Tried That Didn't Work

#### Attempt 1: `scrollToIndex`

```typescript
flatListRef.current.scrollToIndex({ index, viewOffset: 100 });
```

**Why it failed**: Can't scroll past content boundary. The list has a fixed content size, and `scrollToIndex` won't scroll if doing so would put empty space at the edge.

#### Attempt 2: `onLayout.y` + `currentScrollOffset`

```typescript
const absoluteY = layout.y + currentScrollOffset;
scrollToOffset({ offset: absoluteY - clearance });
```

**Why it failed**: Double-counting! Both `layout.y` and `currentScrollOffset` are content-relative values. Adding them gives a meaningless number.

#### Attempt 3: Delta-based scrolling (from content coordinates)

```typescript
const itemBottomY = layout.y + layout.height;
const visibleBottomY = currentOffset + visibleHeight - clearance;
if (itemBottomY > visibleBottomY) {
  scrollToOffset({ offset: currentOffset + (itemBottomY - visibleBottomY) });
}
```

**Why it failed**: This is non-inverted math! In an inverted list, increasing offset moves content UP (away from keyboard), but we need to move it UP to see it. The direction was backwards.

#### Attempt 4: `measureLayout` relative to scroll container

```typescript
node.measureLayout(list.getNativeScrollRef(), (x, y) => {
  scrollToOffset({ offset: y - clearance });
});
```

**Why it failed**: For inverted lists, `y` from `measureLayout` still uses content coordinates where 0 is the "top" of content (which is visually at the bottom). The scroll offset calculation was still wrong.

#### Attempt 5: Measuring entry container instead of input field

```typescript
<View ref={ref => registerRef(item.id, ref)}>
  {/* ... entry content ... */}
  {isEditing && <TextInput ... />}
</View>
```

**Why it failed**: The input field is at the bottom of the expanded edit section. Checking if the container is visible doesn't mean the input is visible - there could be 100+ pixels of content above the input that pushes it behind the keyboard.

#### Attempt 6: Adding arbitrary clearance values

```typescript
const requiredClearance = 150; // guess at input field height
const isBehindKeyboard = itemBottom > visibleBottom - requiredClearance;
```

**Why it failed**: Guessing at clearance values is fragile. Different screen sizes, font sizes, or layout changes break it. Better to measure the actual field.

## The Solution

### Key Insight: Measure the Actual Input Field

Instead of measuring the entry container and guessing where the input is, **put the ref on the input field row itself**:

```tsx
{isEditing && (
  <View style={styles.editSection}>
    <DateStepper ... />
    <View
      style={styles.editFieldsRow}
      ref={ref => registerRef(item.id, ref)}  // ← Ref on the actual field row
    >
      <TextInput ... />
    </View>
  </View>
)}
```

### Key Insight: Use Screen Coordinates

Use `node.measure()` which gives `pageY` - the position on screen. This is what you actually care about.

### Key Insight: Measure the List Too

The list isn't at the top of the screen (it's in a modal). Measure both the list and the field:

```typescript
scrollRef.measure((..., listHeight, listPageY) => {
  node.measure((..., height, pageY) => {
    const listTop = listPageY;
    const visibleBottom = Math.min(listBottom, screenHeight - keyboardHeight);

    const itemTop = pageY;
    const itemBottom = pageY + height;

    const isBehindKeyboard = itemBottom > visibleBottom;
    const isAboveScreen = itemTop < listTop;
  });
});
```

### Key Insight: Inverted Scroll Direction

To move content **up** on screen (away from keyboard), **decrease** the offset:

```typescript
if (isBehindKeyboard) {
  const scrollDelta = itemBottom - visibleBottom + 50;
  const targetOffset = Math.max(0, currentOffset - scrollDelta); // SUBTRACT for inverted
  list.scrollToOffset({ offset: targetOffset, animated: true });
}
```

### Key Insight: paddingBottom for Scroll Space

Without extra padding, you can't scroll past the content boundary. Add padding when editing:

```tsx
<FlatList
  contentContainerStyle={{
    paddingBottom: editingEntry ? keyboardInset + spacing.lg : 0,
  }}
/>
```

## Final Hook: useScrollIntoView

Complete, copy-pasteable implementation:

```typescript
import { useRef, useCallback } from 'react';
import { FlatList, View, Dimensions } from 'react-native';

type Key = string | number;

export function useScrollIntoView<T>({
  listRef,
}: {
  listRef: React.RefObject<FlatList<T> | null>;
}) {
  // Stores refs to actual View nodes (the input field containers)
  const nodeRefs = useRef<Map<Key, View>>(new Map());
  // Track current scroll offset
  const scrollOffset = useRef(0);

  // Register a View ref for an item
  const registerRef = useCallback((key: Key, ref: View | null) => {
    if (ref === null) {
      nodeRefs.current.delete(key);
    } else {
      nodeRefs.current.set(key, ref);
    }
  }, []);

  // Call this from FlatList onScroll
  const onScroll = useCallback((offset: number) => {
    scrollOffset.current = offset;
  }, []);

  // Scroll to a registered key using screen coordinates
  const scrollIntoView = useCallback(
    (key: Key, keyboardHeight = 0, animated = true) => {
      const list = listRef.current;
      if (!list) return;

      const node = nodeRefs.current.get(key);
      if (!node) return;

      // Measure both the FlatList and the node on screen
      const scrollRef = list.getNativeScrollRef() as any;

      scrollRef.measure(
        (
          _lx: number,
          _ly: number,
          _lw: number,
          listHeight: number,
          _lpx: number,
          listPageY: number,
        ) => {
          node.measure(
            (
              _x: number,
              _y: number,
              _width: number,
              height: number,
              _pageX: number,
              pageY: number,
            ) => {
              const screenHeight = Dimensions.get('window').height;
              const listTop = listPageY;
              const listBottom = listPageY + listHeight;
              const visibleBottom = Math.min(
                listBottom,
                screenHeight - keyboardHeight,
              );

              const itemTop = pageY;
              const itemBottom = pageY + height;

              const isBehindKeyboard = itemBottom > visibleBottom;
              const isAboveScreen = itemTop < listTop;

              if (isBehindKeyboard) {
                // How much the item needs to move UP on screen
                const scrollDelta = itemBottom - visibleBottom + 50; // 50px clearance
                const currentOffset = scrollOffset.current;
                // INVERTED LIST: to move content UP visually, DECREASE offset
                const targetOffset = Math.max(0, currentOffset - scrollDelta);

                list.scrollToOffset({
                  offset: targetOffset,
                  animated,
                });
              } else if (isAboveScreen) {
                // Item is scrolled off the top - need to scroll DOWN to bring it back
                const scrollDelta = listTop - itemTop + 50; // 50px clearance from top
                const currentOffset = scrollOffset.current;
                // INVERTED LIST: to move content DOWN visually, INCREASE offset
                const targetOffset = currentOffset + scrollDelta;

                list.scrollToOffset({
                  offset: targetOffset,
                  animated,
                });
              }
            },
          );
        },
      );
    },
    [listRef],
  );

  return {
    registerRef,
    scrollIntoView,
    onScroll,
  };
}
```

## Complete Usage Example

```tsx
import { useRef, useState, useEffect } from 'react';
import { FlatList, View, TextInput, Keyboard, Platform } from 'react-native';
import { useScrollIntoView } from '../hooks/useScrollIntoView';

function MyListComponent() {
  const flatListRef = useRef<FlatList>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [editingEntry, setEditingEntry] = useState<{ id: string } | null>(null);

  // Initialize the hook
  const { registerRef, scrollIntoView, onScroll } = useScrollIntoView({
    listRef: flatListRef,
  });

  // Listen for keyboard open/close
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showListener = Keyboard.addListener(showEvent, e => {
      setKeyboardInset(e.endCoordinates.height);
    });
    const hideListener = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Scroll to editing entry when keyboard opens
  useEffect(() => {
    if (!editingEntry) return;
    if (keyboardInset === 0) return; // Wait for keyboard to open

    // Wait for edit section to render and layout
    const timer = setTimeout(() => {
      scrollIntoView(editingEntry.id, keyboardInset);
    }, 100);

    return () => clearTimeout(timer);
  }, [editingEntry, keyboardInset, scrollIntoView]);

  const renderItem = ({ item }) => {
    const isEditing = editingEntry?.id === item.id;

    return (
      <View>
        {/* Regular item content */}
        <Text>{item.title}</Text>
        <Button onPress={() => setEditingEntry(item)} title="Edit" />

        {/* Edit section - only rendered when editing */}
        {isEditing && (
          <View>
            {/* Put the ref on the View containing the TextInput */}
            <View ref={ref => registerRef(item.id, ref)}>
              <TextInput
                value={item.value}
                autoFocus
                // ... other props
              />
            </View>
            <Button onPress={() => setEditingEntry(null)} title="Done" />
          </View>
        )}
      </View>
    );
  };

  return (
    <FlatList
      ref={flatListRef}
      data={items}
      renderItem={renderItem}
      inverted
      onScroll={e => onScroll(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        // CRITICAL: Add padding so we can scroll past content boundary
        paddingBottom: editingEntry ? keyboardInset + 20 : 0,
      }}
    />
  );
}
```

## Summary

1. **Measure the actual field** - not its container
2. **Use screen coordinates** - `measure()` gives `pageY`
3. **Measure the list position** - it's not at screen top
4. **Invert the scroll direction** - decrease offset to scroll up
5. **Add paddingBottom** - create scroll space for the keyboard
6. **Wait for layout** - the edit section needs time to render
