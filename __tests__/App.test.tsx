/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import App, { SplashOverlay } from '../App';

test('renders the map controls', async () => {
  await render(<App />);

  expect(screen.getByText('Labels')).toBeOnTheScreen();
  expect(screen.getByLabelText('View statistics')).toBeOnTheScreen();
  expect(screen.getByLabelText('Open settings')).toBeOnTheScreen();
  expect(screen.getByLabelText('Recenter map')).toBeOnTheScreen();
  expect(screen.getByLabelText('Add distance')).toBeOnTheScreen();
});

test('shows the splash spinner only after 200ms of loading', () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SplashOverlay loading />);
  });

  expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(0);

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(199);
  });
  expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(0);

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(1);

  ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});
