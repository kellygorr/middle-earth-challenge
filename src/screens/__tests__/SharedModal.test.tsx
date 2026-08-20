import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';

import SharedModal from '../SharedModal';
import { useUIStore } from '../../stores/uiStore';

// The real provider renders nothing until it measures a native layout, which
// never happens under Jest, so the modal would render empty. Scoped to this
// file because mocking it globally makes other suites render far more of the
// app than they currently stub for.
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
    SafeAreaInsetsContext: ReactModule.createContext(insets),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

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
});
