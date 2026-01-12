import { useRef, useCallback } from 'react';
import { FlatList, View, Dimensions } from 'react-native';

type Key = string | number;

export function useScrollIntoView<T>({
  listRef,
}: {
  listRef: React.RefObject<FlatList<T> | null>;
}) {
  // Stores refs to actual View nodes
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
      if (!list) {
        return;
      }

      const node = nodeRefs.current.get(key);
      if (!node) {
        return;
      }

      // Measure node position relative to the window, and get FlatList position too
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
          node.measure((_x, _y, _width, height, _pageX, pageY) => {
            const screenHeight = Dimensions.get('window').height;
            const listTop = listPageY;
            const listBottom = listPageY + listHeight;
            const visibleBottom = Math.min(
              listBottom,
              screenHeight - keyboardHeight,
            );

            const itemTop = pageY;
            const itemBottom = pageY + height;

            // Now measuring the actual input field, so just need small clearance
            const isBehindKeyboard = itemBottom > visibleBottom;
            const isAboveScreen = itemTop < listTop;
            const isVisible = !isBehindKeyboard && !isAboveScreen;

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
          });
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
