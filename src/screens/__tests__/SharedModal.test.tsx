import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';

import SharedModal from '../SharedModal';
import { useUIStore } from '../../stores/uiStore';

describe('SharedModal navigation', () => {
  afterEach(async () => {
    await act(() => {
      useUIStore.setState({ modalStack: [] });
    });
  });

  it('pops back to the modal underneath instead of closing everything', async () => {
    useUIStore.setState({
      modalStack: [{ type: 'info', params: {} }, { type: 'miles' }],
    });

    const user = userEvent.setup();
    await render(<SharedModal />);

    await user.press(screen.getByText('Back'));

    expect(useUIStore.getState().modalStack.map(s => s.type)).toEqual(['info']);
  });

  it('pops one level even when Back is pressed repeatedly', async () => {
    useUIStore.setState({
      modalStack: [
        { type: 'info', params: {} },
        { type: 'info', params: {} },
        { type: 'miles' },
      ],
    });

    const user = userEvent.setup();
    await render(<SharedModal />);

    const back = screen.getByText('Back');
    await user.press(back);
    await user.press(back);

    expect(useUIStore.getState().modalStack).toHaveLength(2);
  });

  it('closes the whole stack from the close button', async () => {
    useUIStore.setState({
      modalStack: [{ type: 'info', params: {} }, { type: 'miles' }],
    });

    const user = userEvent.setup();
    await render(<SharedModal />);

    await user.press(screen.getByLabelText('Close'));

    expect(useUIStore.getState().modalStack).toHaveLength(0);
  });

  it('names icon-only navigation controls', async () => {
    useUIStore.setState({ modalStack: [{ type: 'settings' }] });
    const { rerender } = await render(<SharedModal />);

    expect(screen.getByLabelText('Home')).toBeOnTheScreen();
    expect(screen.getByLabelText('Close')).toBeOnTheScreen();

    await act(() => {
      useUIStore.setState({ modalStack: [{ type: 'data' }] });
    });
    rerender(<SharedModal />);

    expect(screen.getByLabelText('Back')).toBeOnTheScreen();
  });
});
