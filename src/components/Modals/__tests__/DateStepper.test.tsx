import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import DateStepper from '../DateStepper';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('DateStepper', () => {
  it('steps the date back and forward by one day', async () => {
    const user = userEvent.setup();
    const onDateChange = jest.fn();
    const today = Date.now();

    await render(
      <DateStepper
        date={today - ONE_DAY_MS}
        onDateChange={onDateChange}
        maxDate={today}
      />,
    );

    await user.press(screen.getByLabelText('Previous day'));
    expect(onDateChange).toHaveBeenCalledWith(today - 2 * ONE_DAY_MS);

    await user.press(screen.getByLabelText('Next day'));
    expect(onDateChange).toHaveBeenCalledWith(today);
  });

  // Regression: a future-dated manual entry is never overwritten once the
  // real date arrives and Health Connect/pedometer data syncs in for that
  // day — automatic entries use their own day-keyed ids entirely unrelated
  // to a manual entry's id, so both rows would persist and silently
  // double-count that day's distance/steps in every total. The "Next day"
  // control must never be able to advance past today's calendar day.
  it('disables stepping forward once the date reaches today and ignores a forced press', async () => {
    const user = userEvent.setup();
    const onDateChange = jest.fn();
    const today = Date.now();

    await render(
      <DateStepper date={today} onDateChange={onDateChange} maxDate={today} />,
    );

    const nextButton = screen.getByLabelText('Next day');
    expect(nextButton.props.accessibilityState?.disabled).toBe(true);

    await user.press(nextButton);
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('still allows stepping backward from today', async () => {
    const user = userEvent.setup();
    const onDateChange = jest.fn();
    const today = Date.now();

    await render(
      <DateStepper date={today} onDateChange={onDateChange} maxDate={today} />,
    );

    await user.press(screen.getByLabelText('Previous day'));
    expect(onDateChange).toHaveBeenCalledWith(today - ONE_DAY_MS);
  });

  it('compares by calendar day, not exact timestamp, so today at any time of day is at the max', async () => {
    const user = userEvent.setup();
    const onDateChange = jest.fn();
    // maxDate ("now") is late in the day; the entry's stored date is
    // earlier the same calendar day. A naive timestamp comparison would
    // incorrectly still allow stepping forward (entry time < now time)
    // even though both are the same day and the real max has been reached.
    const nowLateInDay = new Date(2026, 4, 15, 23, 0, 0).getTime();
    const sameDayEarlier = new Date(2026, 4, 15, 8, 0, 0).getTime();

    await render(
      <DateStepper
        date={sameDayEarlier}
        onDateChange={onDateChange}
        maxDate={nowLateInDay}
      />,
    );

    const nextButton = screen.getByLabelText('Next day');
    expect(nextButton.props.accessibilityState?.disabled).toBe(true);

    await user.press(nextButton);
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('defaults maxDate to now when not provided, blocking any future date', async () => {
    const onDateChange = jest.fn();
    const farFuture = Date.now() + 30 * ONE_DAY_MS;

    await render(<DateStepper date={farFuture} onDateChange={onDateChange} />);

    const nextButton = screen.getByLabelText('Next day');
    expect(nextButton.props.accessibilityState?.disabled).toBe(true);
  });
});
