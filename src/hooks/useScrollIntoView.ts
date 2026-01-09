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
        console.log('[scrollIntoView] No list ref');
        return;
      }

      const node = nodeRefs.current.get(key);
      if (!node) {
        console.log('[scrollIntoView] No node for key:', key);
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

            console.log('[scrollIntoView] ===== VISIBILITY CHECK =====');
            console.log(
              '[scrollIntoView] Screen height:',
              screenHeight.toFixed(0),
            );
            console.log(
              '[scrollIntoView] Field: top=' +
                itemTop.toFixed(0) +
                ', bottom=' +
                itemBottom.toFixed(0) +
                ', height=' +
                height.toFixed(0),
            );
            console.log(
              '[scrollIntoView] List: top=' +
                listTop.toFixed(0) +
                ', bottom=' +
                listBottom.toFixed(0) +
                ', visibleBottom=' +
                visibleBottom.toFixed(0),
            );
            console.log(
              '[scrollIntoView] Keyboard height:',
              keyboardHeight.toFixed(0),
              'keyboard starts at:',
              (screenHeight - keyboardHeight).toFixed(0),
            );
            console.log(
              '[scrollIntoView] RESULT:',
              isVisible
                ? '✅ VISIBLE'
                : isBehindKeyboard
                ? '❌ BEHIND KEYBOARD'
                : '❌ ABOVE SCREEN',
            );

            if (isBehindKeyboard) {
              // How much the item needs to move UP on screen
              const scrollDelta = itemBottom - visibleBottom + 50; // 50px clearance
              const currentOffset = scrollOffset.current;
              // INVERTED LIST: to move content UP visually, DECREASE offset
              const targetOffset = Math.max(0, currentOffset - scrollDelta);
              console.log(
                '[scrollIntoView] Current offset:',
                currentOffset.toFixed(0),
              );
              console.log(
                '[scrollIntoView] Need to move up by:',
                scrollDelta.toFixed(0),
                '→ target offset:',
                targetOffset.toFixed(0),
              );

              list.scrollToOffset({
                offset: targetOffset,
                animated,
              });

              // Verify after scroll completes
              setTimeout(() => {
                node.measure((_x2, _y2, _w2, h2, _px2, py2) => {
                  const newBottom = py2 + h2;
                  // Add 10px tolerance for rounding
                  const nowVisible =
                    newBottom <= visibleBottom + 10 && py2 >= listTop - 10;
                  console.log(
                    '[scrollIntoView] AFTER SCROLL: top=' +
                      py2.toFixed(0) +
                      ', bottom=' +
                      newBottom.toFixed(0) +
                      ', visibleBottom=' +
                      visibleBottom.toFixed(0) +
                      ' ' +
                      (nowVisible ? '✅ NOW VISIBLE' : '❌ STILL NOT VISIBLE'),
                  );
                });
              }, 350);
            } else if (isAboveScreen) {
              // Item is scrolled off the top - need to scroll DOWN to bring it back
              const scrollDelta = listTop - itemTop + 50; // 50px clearance from top
              const currentOffset = scrollOffset.current;
              // INVERTED LIST: to move content DOWN visually, INCREASE offset
              const targetOffset = currentOffset + scrollDelta;
              console.log(
                '[scrollIntoView] Current offset:',
                currentOffset.toFixed(0),
              );
              console.log(
                '[scrollIntoView] Need to move down by:',
                scrollDelta.toFixed(0),
                '→ target offset:',
                targetOffset.toFixed(0),
              );

              list.scrollToOffset({
                offset: targetOffset,
                animated,
              });

              // Verify after scroll completes
              setTimeout(() => {
                node.measure((_x2, _y2, _w2, h2, _px2, py2) => {
                  const newTop = py2;
                  const nowVisible = newTop >= listTop;
                  console.log(
                    '[scrollIntoView] AFTER SCROLL: top=' +
                      newTop.toFixed(0) +
                      ' ' +
                      (nowVisible ? '✅ NOW VISIBLE' : '❌ STILL ABOVE SCREEN'),
                  );
                });
              }, 350);
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
