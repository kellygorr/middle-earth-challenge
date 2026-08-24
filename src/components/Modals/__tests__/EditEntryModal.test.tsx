import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
} from '@testing-library/react-native';

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

  it('does not use persistent native reselection', async () => {
    openEntry(persistedEntry);
    await render(<EditEntryModal />);

    const input = screen.getByDisplayValue('3');
    expect(input.props.selectTextOnFocus).toBeUndefined();
    expect(input.props.onFocus).toEqual(expect.any(Function));
  });

  it('names icon-only edit controls', async () => {
    openEntry(persistedEntry);
    await render(<EditEntryModal />);

    expect(screen.getByLabelText('Delete entry')).toBeOnTheScreen();
    expect(screen.getByLabelText('Close editor')).toBeOnTheScreen();
    expect(screen.getByLabelText('Previous day')).toBeOnTheScreen();
    expect(screen.getByLabelText('Next day')).toBeOnTheScreen();
    expect(screen.getByLabelText('Reset changes')).toBeOnTheScreen();
  });

  it('commits a typed time before Save writes the entry', async () => {
    const user = userEvent.setup();
    openEntry(persistedEntry);
    await render(<EditEntryModal />);

    const timeInput = screen.getByTestId('edit-time-input');
    fireEvent.changeText(timeInput, '3:42 PM');
    await user.press(screen.getByText('Save'));

    const expectedDate = new Date(persistedEntry.date as number);
    expectedDate.setHours(15, 42, 0, 0);
    expect(addDistanceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ date: expectedDate.getTime() }),
    );
  });

  describe('input validation', () => {
    const saveWith = async (value: string) => {
      const user = userEvent.setup();
      openEntry(persistedEntry);
      await render(<EditEntryModal />);

      const input = screen.getByDisplayValue('3');
      await user.clear(input);
      await user.type(input, value);
      await user.press(screen.getByText('Save'));
    };

    it('rejects a non-finite value', async () => {
      // parseFloat('1e400') is Infinity, which isNaN happily accepts. An
      // Infinity that reaches the database poisons every later total.
      await saveWith('1e400');
      expect(addDistanceEntry).not.toHaveBeenCalled();
      expect(screen.getByText('Maximum entry is 5,000,000.')).toBeOnTheScreen();
      expect(screen.getByText('Edit')).toBeOnTheScreen();
      expect(useUIStore.getState().editingEntry).toEqual(persistedEntry);
    });

    it('accepts the shared cap', async () => {
      await saveWith('5000000');
      expect(addDistanceEntry).toHaveBeenCalledWith(
        expect.objectContaining({ miles: 5000000 }),
      );
    });

    it('rejects fractional steps without silently rounding', async () => {
      const user = userEvent.setup();
      openEntry(persistedEntry);
      await render(<EditEntryModal />);

      await user.press(screen.getByText('Steps'));
      const input = screen.getByDisplayValue('6000');
      await user.clear(input);
      await user.type(input, '10.7');
      await user.press(screen.getByText('Save'));

      expect(
        screen.getByText('Steps must be a whole number.'),
      ).toBeOnTheScreen();
      expect(addDistanceEntry).not.toHaveBeenCalled();
    });
  });
});
