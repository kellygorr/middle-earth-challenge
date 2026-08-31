import React from 'react';
import { render, screen } from '@testing-library/react-native';

import Button from '../Button';

describe('Button accessibility', () => {
  it('exposes button semantics and merges caller and native state', async () => {
    await render(
      <Button
        onPress={jest.fn()}
        disabled
        accessibilityLabel="Save journey"
        accessibilityHint="Saves the current changes"
        accessibilityState={{ selected: true }}
      >
        Save
      </Button>,
    );

    const button = screen.getByLabelText('Save journey');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityHint).toBe('Saves the current changes');
    expect(button.props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
  });

  it('exposes caret-backed open state as expanded', async () => {
    const view = await render(
      <Button
        onPress={jest.fn()}
        isOpen={false}
        accessibilityLabel="Journey details"
      >
        Details
      </Button>,
    );

    expect(
      screen.getByLabelText('Journey details').props.accessibilityState,
    ).toEqual({ disabled: false, expanded: false });

    await view.rerender(
      <Button onPress={jest.fn()} isOpen accessibilityLabel="Journey details">
        Details
      </Button>,
    );

    expect(
      screen.getByLabelText('Journey details').props.accessibilityState,
    ).toEqual({ disabled: false, expanded: true });
  });
});
