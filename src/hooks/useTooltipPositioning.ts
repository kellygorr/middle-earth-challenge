import { useEffect } from 'react';

export function useTooltipPositioning(
  ref: React.MutableRefObject<any>,
  showTooltip: boolean,
  setTooltipPosition: (pos: { top: number; left: number } | null) => void,
  spacingValue: number,
  width: number,
  height: number,
) {
  useEffect(() => {
    if (!showTooltip) return;
    const node = ref.current as any;
    if (!node || typeof node.measureInWindow !== 'function') return;
    const measure = () => {
      try {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          const top = y + h + spacingValue;
          const left = x;
          setTooltipPosition({ top, left });
        });
      } catch {}
    };
    requestAnimationFrame(measure);
  }, [ref, showTooltip, setTooltipPosition, spacingValue]);

  useEffect(() => {
    if (!showTooltip) return;
    const node = ref.current as any;
    if (!node || typeof node.measureInWindow !== 'function') return;
    requestAnimationFrame(() => {
      try {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          const top = y + h + spacingValue;
          const left = x;
          setTooltipPosition({ top, left });
        });
      } catch {}
    });
  }, [ref, width, height, showTooltip, spacingValue, setTooltipPosition]);
}
