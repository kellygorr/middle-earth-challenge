import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';

import EditEntryModal from '../EditEntryModal';
import { useUIStore } from '../../../stores/uiStore';
import { useProgressStore } from '../../../stores/progressStore';
import type { DistanceEntry } from '../../../types';

const persistedEntry: DistanceEntry = {
  id: 'entry-1',
  saveId: 'default',
  date: new Date('2026-05-04T12:00:00Z').getTime(),
  miles: 3,
  steps: 6000,
  source: 'manual',
};

const openEntry = (entry: DistanceEntry) => {
  useUIStore.setState({
    editingEntry: entry,
    editDate: entry.date as number,
  });
};

describe('EditEntryModal', () => {
  let addDistanceEntry: jest.Mock;
  let removeDistanceEntry: jest.Mock;

  beforeEach(() => {
    addDistanceEntry = jest.fn().mockResolvedValue(undefined);
    removeDistanceEntry = jest.fn().mockResolvedValue(undefined);
    useProgressStore.setState({
      addDistanceEntry,
      removeDistanceEntry,
      clearTestOverride: jest.fn(),
    } as unknown as Parameters<typeof useProgressStore.setState>[0]);
  });

  afterEach(async () => {
    await act(() => {
      useUIStore.setState({ editingEntry: null, editDate: null });
    });
  });

  it('writes the edit once when Save is pressed repeatedly', async () => {
    const user = userEvent.setup();
    openEntry(persistedEntry);
    await render(<EditEntryModal />);

    const save = screen.getByText('Save');
    await user.press(save);
    await user.press(save);
    await user.press(save);

    expect(addDistanceEntry).toHaveBeenCalledTimes(1);
    // Same id, so the write replaces the row rather than duplicating it.
    expect(addDistanceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-1', miles: 3 }),
    );
  });

  it('releases the lock once a different entry is opened', async () => {
    const user = userEvent.setup();
    openEntry(persistedEntry);
    await render(<EditEntryModal />);

    await user.press(screen.getByText('Save'));
    expect(addDistanceEntry).toHaveBeenCalledTimes(1);

    await act(() => {
      openEntry({ ...persistedEntry, id: 'entry-2' });
    });
    await user.press(screen.getByText('Save'));

    expect(addDistanceEntry).toHaveBeenCalledTimes(2);
    expect(addDistanceEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'entry-2' }),
    );
  });
});
