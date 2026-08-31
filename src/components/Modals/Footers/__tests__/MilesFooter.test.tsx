import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';

import MilesFooter from '../MilesFooter';
import { useProgressStore } from '../../../../stores/progressStore';
import { useSettingsStore } from '../../../../stores/settingsStore';
import { useUIStore } from '../../../../stores/uiStore';

describe('MilesFooter', () => {
  let addDistanceEntry: jest.Mock;

  beforeEach(() => {
    addDistanceEntry = jest.fn().mockResolvedValue(undefined);
    useProgressStore.setState({
      addDistanceEntry,
      clearTestOverride: jest.fn(),
    } as unknown as Parameters<typeof useProgressStore.setState>[0]);
    useSettingsStore.setState({ useMiles: true });
    useUIStore.setState({ editingEntry: null, editDate: null });
  });

  it('reserves validation space and explains rejected input', async () => {
    const user = userEvent.setup();
    await render(<MilesFooter />);

    expect(screen.getByTestId('add-entry-validation')).toHaveTextContent(' ');

    const input = screen.getByPlaceholderText('0');
    await user.type(input, '-1');
    await user.press(screen.getByText('Add'));

    expect(screen.getByText('Value cannot be negative.')).toBeOnTheScreen();
    expect(addDistanceEntry).not.toHaveBeenCalled();

    await user.clear(input);
    expect(screen.queryByText('Value cannot be negative.')).toBeNull();
  });

  it('labels the value field and exposes selected entry type', async () => {
    const user = userEvent.setup();
    await render(<MilesFooter />);

    expect(screen.getByLabelText('Distance in miles')).toBeOnTheScreen();
    expect(screen.getByLabelText('Entry type').props.accessibilityRole).toBe(
      'radiogroup',
    );
    expect(screen.getByLabelText('Miles').props.accessibilityState).toEqual({
      selected: true,
    });
    const stepsOption = screen.getByLabelText('Steps');
    expect(stepsOption.props.accessibilityState).toEqual({ selected: false });

    await user.press(stepsOption);

    const stepsControls = screen.getAllByLabelText('Steps');
    expect(
      stepsControls.find(control => control.props.accessibilityRole === 'radio')
        ?.props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      stepsControls.find(
        control => control.props.accessibilityRole !== 'radio',
      ),
    ).toBeOnTheScreen();
  });

  it('rejects fractional steps', async () => {
    const user = userEvent.setup();
    await render(<MilesFooter />);

    await user.press(screen.getByText('Steps'));
    await user.type(screen.getByPlaceholderText('0'), '0.5');
    await user.press(screen.getByText('Add'));

    expect(screen.getByText('Steps must be a whole number.')).toBeOnTheScreen();
    expect(addDistanceEntry).not.toHaveBeenCalled();
  });

  it('stays mounted while an entry is edited in the overlay', async () => {
    const date = Date.now();
    useUIStore.setState({
      editingEntry: {
        id: 'entry-1',
        saveId: 'default',
        date,
        miles: 1,
        steps: 2112,
        source: 'manual',
      },
      editDate: date,
    });

    await render(<MilesFooter />);

    expect(screen.getByText('Add')).toBeOnTheScreen();
    expect(screen.getByTestId('add-entry-validation')).toBeOnTheScreen();
  });

  it('retains input and permits retry after a write fails', async () => {
    const user = userEvent.setup();
    addDistanceEntry
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    await render(<MilesFooter />);

    const input = screen.getByPlaceholderText('0');
    await user.type(input, '3');
    await user.press(screen.getByText('Add'));

    expect(
      screen.getByText('Could not save entry. Try again.'),
    ).toBeOnTheScreen();
    expect(input).toHaveDisplayValue('3');

    await user.press(screen.getByText('Add'));
    expect(addDistanceEntry).toHaveBeenCalledTimes(2);
    expect(input).toHaveDisplayValue('');
  });
});
