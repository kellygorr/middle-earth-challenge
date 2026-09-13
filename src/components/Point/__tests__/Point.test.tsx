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

describe('Point label-size independence', () => {
  // Regression coverage: the icon's own box used to be a flex row with
  // alignItems: 'center', so a taller label (e.g. switching label size to
  // "large") grew the row and re-centered the icon within it, visibly
  // bumping checkpoint markers off the path. The icon box is now a fixed
  // 24x24 anchored box for every non-'top' label position, and the label
  // is positioned independently beside it, so its size can never move
  // the icon.
  const getIconStyle = (renderResult: Awaited<ReturnType<typeof render>>) => {
    const node = renderResult.getByTestId('point-icon-container');
    return Array.isArray(node.props.style)
      ? Object.assign({}, ...node.props.style.flat(Infinity).filter(Boolean))
      : node.props.style;
  };

  const getLabelStyle = (renderResult: Awaited<ReturnType<typeof render>>) => {
    const node = renderResult.getByTestId('point-label-wrapper', {
      includeHiddenElements: true,
    });
    return Array.isArray(node.props.style)
      ? Object.assign({}, ...node.props.style.flat(Infinity).filter(Boolean))
      : node.props.style;
  };

  it('keeps the icon box a fixed 24x24 regardless of label height, for the default (right) label position', async () => {
    const short = await render(
      <Point {...baseProps} type="checkpoint" labelHeight={20} />,
    );
    const tall = await render(
      <Point {...baseProps} type="checkpoint" labelHeight={80} />,
    );

    expect(getIconStyle(short)).toMatchObject({ width: 24, height: 24 });
    expect(getIconStyle(tall)).toMatchObject({ width: 24, height: 24 });
  });

  it('keeps the icon box a fixed 24x24 regardless of label height, for the left label position', async () => {
    const short = await render(
      <Point
        {...baseProps}
        type="checkpoint"
        labelPosition="left"
        labelHeight={20}
      />,
    );
    const tall = await render(
      <Point
        {...baseProps}
        type="checkpoint"
        labelPosition="left"
        labelHeight={80}
      />,
    );

    expect(getIconStyle(short)).toMatchObject({ width: 24, height: 24 });
    expect(getIconStyle(tall)).toMatchObject({ width: 24, height: 24 });
  });

  it('shifts only the label vertically as label height changes, via top offset', async () => {
    const short = await render(
      <Point {...baseProps} type="checkpoint" labelHeight={20} />,
    );
    const tall = await render(
      <Point {...baseProps} type="checkpoint" labelHeight={80} />,
    );

    expect(getLabelStyle(short).top).toBe((24 - 20) / 2);
    expect(getLabelStyle(tall).top).toBe((24 - 80) / 2);
  });

  it('reserves a minimum width to avoid letter-wrapping, while keeping the visible pill sized to its own content', async () => {
    // Regression test: an absolutely positioned View with no width hint at
    // all collapses toward zero here and wraps its Text one character per
    // line — minWidth is required to prevent that (matching the proven
    // working nameContainerLeft, which pairs the same minWidth with its
    // own alignItems override). alignItems: 'flex-start' then keeps the
    // actual visible label pill sized to its own content rather than
    // stretching to fill the full reserved minWidth, so a short name like
    // "Bree" doesn't render as an oversized, heavily padded pill.
    const right = await render(
      <Point {...baseProps} type="checkpoint" name="Rivendell" />,
    );

    const style = getLabelStyle(right);
    expect(style.minWidth).toBeGreaterThan(0);
    expect(style.alignItems).toBe('flex-start');
  });
});
