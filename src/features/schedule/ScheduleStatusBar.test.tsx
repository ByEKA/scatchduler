import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScheduleStatusBar } from '@/features/schedule/ScheduleStatusBar';

describe('ScheduleStatusBar', () => {
  it('formats As imported, Calculated (P6/MSP/Default), Recalculate needed, filter counts, zoom, and solve ms', () => {
    const { rerender } = render(
      <ScheduleStatusBar
        code="UP-02"
        statusDate="2026-10-15T08:00"
        displayMode="as_imported"
        profile="p6"
        stale={false}
        totalActivities={120}
        shownActivities={120}
        isFiltered={false}
        zoom="week"
        durationMs={null}
      />,
    );

    const bar = screen.getByRole('contentinfo', { name: 'Schedule status' });
    expect(bar).toHaveTextContent('UP-02 · Status date 15.10.2026 · As imported');
    expect(bar).toHaveTextContent('120 activities · Week');

    rerender(
      <ScheduleStatusBar
        code="UP-02"
        statusDate={null}
        displayMode="calculated"
        profile="p6"
        stale={false}
        totalActivities={120}
        shownActivities={5}
        isFiltered
        zoom="day"
        durationMs={14.6}
      />,
    );
    expect(bar).toHaveTextContent('UP-02 · Status date — · Calculated (P6)');
    expect(bar).toHaveTextContent('5 of 120 · Day · Calculated in 15 ms');

    rerender(
      <ScheduleStatusBar
        code="UP-02"
        statusDate="2026-10-15T08:00"
        displayMode="calculated"
        profile="msp"
        stale
        totalActivities={120}
        shownActivities={120}
        isFiltered={false}
        zoom="quarter"
        durationMs={8}
      />,
    );
    expect(bar).toHaveTextContent('UP-02 · Status date 15.10.2026 · Recalculate needed');
    expect(bar).toHaveTextContent('120 activities · Quarter · Calculated in 8 ms');
  });
});
