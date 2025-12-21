import {
  computePathProgress,
  getDefaultBreakpoints,
} from '../src/utils/pathProgress';
import { TOTAL_JOURNEY_MILES } from '../src/constants/journey';

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('path progress mapping', () => {
  it('maps 0 book miles to 0', () => {
    const bps = getDefaultBreakpoints();
    const t = computePathProgress(0, bps, TOTAL_JOURNEY_MILES);
    expect(approx(t, 0)).toBe(true);
  });

  it('maps 120 book miles to Bree visual target (105)', () => {
    const bps = getDefaultBreakpoints();
    const t = computePathProgress(120, bps, TOTAL_JOURNEY_MILES);
    const expected = 105 / TOTAL_JOURNEY_MILES;
    expect(approx(t, expected)).toBe(true);
  });

  it('is monotonic between breakpoints', () => {
    const bps = getDefaultBreakpoints();
    let prev = -1;
    for (let m = 0; m <= TOTAL_JOURNEY_MILES; m += 5) {
      const t = computePathProgress(m, bps, TOTAL_JOURNEY_MILES);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});
