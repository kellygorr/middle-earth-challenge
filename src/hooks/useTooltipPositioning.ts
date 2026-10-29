import { useEffect, useRef } from 'react';
import { Pressable } from 'react-native';

export function useTooltipPositioning(
  ref: React.MutableRefObject<React.ElementRef<typeof Pressable> | null>,
  showTooltip: boolean,
  setTooltipPosition: (pos: { top: number; left: number } | null) => void,
  spacingValue: number,
  width: number,
  height: number,
) {
  // measureInWindow resolves natively, so its callback can still arrive after
  // unmount even once the frame itself is cancelled.
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  // One effect covers both mount and resize; the previous split pair measured
  // twice on every dimension change.
  useEffect(() => {
    if (!showTooltip) return;
    const node = ref.current;
    if (!node || typeof node.measureInWindow !== 'function') return;

    const frame = requestAnimationFrame(() => {
      try {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          if (!activeRef.current) return;
          setTooltipPosition({ top: y + h + spacingValue, left: x });
        });
      } catch {}
    });

    return () => cancelAnimationFrame(frame);
  }, [ref, width, height, showTooltip, spacingValue, setTooltipPosition]);
}
