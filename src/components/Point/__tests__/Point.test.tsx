import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import Point from '../Point';

const baseProps = {
  x: 0,
  y: 0,
  name: 'Rivendell',
  isActive: true,
  showLabel: true,
  labelHeight: 26,
  onPress: jest.fn(),
};

describe('Point accessibility', () => {
  beforeEach(() => {
    baseProps.onPress.mockClear();
  });

  it('exposes one named checkpoint action when its visual label is shown', async () => {
    await render(<Point {...baseProps} type="checkpoint" />);

    const action = screen.getByLabelText('Rivendell, Checkpoint, reached');
    expect(action.props.accessibilityRole).toBe('button');
    expect(screen.queryByLabelText('Rivendell')).toBeNull();

    fireEvent.press(action);
    expect(baseProps.onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps a locked checkpoint named when labels are hidden', async () => {
    await render(
      <Point
        {...baseProps}
        isActive={false}
        showLabel={false}
        type="checkpoint"
      />,
    );

    const action = screen.getByLabelText('Rivendell, Checkpoint, locked');
    expect(action.props.accessibilityRole).toBe('button');
    expect(screen.queryByLabelText('Rivendell')).toBeNull();
  });

  it('gives trivia points a descriptive button name', async () => {
    await render(
      <Point {...baseProps} name="Second breakfast" type="trivia" />,
    );

    const action = screen.getByLabelText('Second breakfast, Trivia');
    expect(action.props.accessibilityRole).toBe('button');
  });
});
