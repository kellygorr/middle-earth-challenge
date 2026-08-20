/**
 * Unit tests for `checkAndFireMilestones` — the pedometer commit
 * path's checkpoint-crossing notifier.
 *
 * We mock the checkpoints JSON, the settings store, the pedometer
 * service, and AppState so the tests exercise only the crossing-detection
 * + watermark logic in isolation.
 */

// jest.mock factories may only reference variables prefixed with
// `mock` — anything else fails hoist-time validation.

const mockFire = jest.fn();
const mockUpdateSyncSettings = jest.fn();
const mockRefs = {
  appState: 'background' as 'active' | 'background' | 'inactive',
  lastNotified: -1 as number,
};

jest.mock('../pedometerService', () => ({
  pedometerService: {
    fireMilestoneNotification: (title: string, body: string, index: number) =>
      mockFire(title, body, index),
  },
}));

jest.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      lastNotifiedCheckpointIndex: mockRefs.lastNotified,
      updateSyncSettings: async (updates: {
        lastNotifiedCheckpointIndex: number;
      }) => {
        mockRefs.lastNotified = updates.lastNotifiedCheckpointIndex;
        mockUpdateSyncSettings(updates);
      },
    }),
  },
}));

jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockRefs.appState;
    },
  },
}));

// Default checkpoint fixture mirrors the shape of the real JSON — a
// start checkpoint (Hobbiton) + a handful of milestones we can cross
// in tests. Individual tests can override via jest.doMock before the
// require() below.
function withCheckpoints(cps: Array<Record<string, unknown>>) {
  jest.doMock('../../constants/checkpoints.json', () => cps);
}

// Re-require the module under test after mocks are in place.
function loadNotifier() {
  return require('../milestoneNotifier') as typeof import('../milestoneNotifier');
}

beforeEach(() => {
  jest.resetModules();
  mockFire.mockReset();
  mockFire.mockResolvedValue(true);
  mockUpdateSyncSettings.mockReset();
  mockRefs.appState = 'background';
  mockRefs.lastNotified = -1;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkAndFireMilestones', () => {
  const fixture = [
    {
      name: 'Hobbiton',
      CUMULATIVE_MILES: 0,
      isStart: true,
      description: { text: 'The Shire.' },
    },
    {
      name: 'Rivendell',
      CUMULATIVE_MILES: 120,
      description: { text: 'Elven refuge in the valley.' },
    },
    {
      name: 'Moria',
      CUMULATIVE_MILES: 420,
      description: { text: 'The mines beneath the Misty Mountains.' },
    },
    {
      name: 'Lothlorien',
      CUMULATIVE_MILES: 595,
      description: { text: 'Golden woods of the Galadhrim.' },
    },
  ];

  it('is a no-op when milesAfter <= milesBefore', async () => {
    withCheckpoints(fixture);
    const { checkAndFireMilestones } = loadNotifier();

    await checkAndFireMilestones(100, 100);
    await checkAndFireMilestones(100, 50);

    expect(mockFire).not.toHaveBeenCalled();
    expect(mockUpdateSyncSettings).not.toHaveBeenCalled();
  });

  it('fires nothing when the window does not cross any checkpoint', async () => {
    withCheckpoints(fixture);
    const { checkAndFireMilestones } = loadNotifier();

    await checkAndFireMilestones(10, 100);

    expect(mockFire).not.toHaveBeenCalled();
    expect(mockUpdateSyncSettings).not.toHaveBeenCalled();
  });

  it('fires exactly once when a single checkpoint is crossed in the background', async () => {
    withCheckpoints(fixture);
    const { checkAndFireMilestones } = loadNotifier();
    mockRefs.appState = 'background';

    await checkAndFireMilestones(100, 130);

    expect(mockFire).toHaveBeenCalledTimes(1);
    const [title, , index] = mockFire.mock.calls[0];
    expect(title).toContain('Rivendell');
    expect(index).toBe(1); // fixture index of Rivendell
    expect(mockUpdateSyncSettings).toHaveBeenCalledWith({
      lastNotifiedCheckpointIndex: 1,
    });
  });

  it('fires each crossed checkpoint in order for a multi-checkpoint window', async () => {
    withCheckpoints(fixture);
    const { checkAndFireMilestones } = loadNotifier();
    mockRefs.appState = 'background';

    await checkAndFireMilestones(100, 600);

    expect(mockFire).toHaveBeenCalledTimes(3);
    expect(mockFire.mock.calls[0][2]).toBe(1); // Rivendell
    expect(mockFire.mock.calls[1][2]).toBe(2); // Moria
    expect(mockFire.mock.calls[2][2]).toBe(3); // Lothlorien
    // Watermark advances to the highest crossed index.
    expect(mockUpdateSyncSettings).toHaveBeenCalledWith({
      lastNotifiedCheckpointIndex: 3,
    });
  });

  it('skips the isStart checkpoint even when milesBefore is negative', async () => {
    withCheckpoints(fixture);
    const { checkAndFireMilestones } = loadNotifier();

    await checkAndFireMilestones(-1, 130);

    // Hobbiton (isStart, CUMULATIVE_MILES=0) must never fire — the user
    // opens the app already there.
    expect(mockFire).toHaveBeenCalledTimes(1);
    expect(mockFire.mock.calls[0][0]).toContain('Rivendell');
  });

  it('skips checkpoints below/at the persisted watermark', async () => {
    withCheckpoints(fixture);
    mockRefs.lastNotified = 1; // Rivendell already announced
    const { checkAndFireMilestones } = loadNotifier();

    await checkAndFireMilestones(100, 500);

    // Only Moria (index 2) fires — Rivendell is behind the watermark.
    expect(mockFire).toHaveBeenCalledTimes(1);
    expect(mockFire.mock.calls[0][2]).toBe(2);
    expect(mockUpdateSyncSettings).toHaveBeenCalledWith({
      lastNotifiedCheckpointIndex: 2,
    });
  });

  it('suppresses notifications in the foreground but still advances the watermark', async () => {
    withCheckpoints(fixture);
    mockRefs.appState = 'active';
    const { checkAndFireMilestones } = loadNotifier();

    await checkAndFireMilestones(100, 600);

    // No native notification calls while foregrounded — the map
    // celebration handles the ping.
    expect(mockFire).not.toHaveBeenCalled();
    // But the watermark advances so we don't emit stale pings the
    // next time we background.
    expect(mockUpdateSyncSettings).toHaveBeenCalledWith({
      lastNotifiedCheckpointIndex: 3,
    });
  });

  it('does not throw when the native notification rejects', async () => {
    withCheckpoints(fixture);
    mockFire.mockRejectedValue(new Error('POST_NOTIFICATIONS denied'));
    const { checkAndFireMilestones } = loadNotifier();

    await expect(checkAndFireMilestones(100, 600)).resolves.toBeUndefined();
    // Watermark still advances so we don't retry forever.
    expect(mockUpdateSyncSettings).toHaveBeenCalledWith({
      lastNotifiedCheckpointIndex: 3,
    });
  });

  it('ignores checkpoints with non-finite CUMULATIVE_MILES', async () => {
    withCheckpoints([
      ...fixture,
      {
        name: 'Broken',
        CUMULATIVE_MILES: 'nope',
        description: { text: 'bad data' },
      },
    ]);
    const { checkAndFireMilestones } = loadNotifier();

    // Should not throw or fire the malformed checkpoint.
    await checkAndFireMilestones(100, 130);
    expect(mockFire).toHaveBeenCalledTimes(1);
    expect(mockFire.mock.calls[0][0]).toContain('Rivendell');
  });
});
