import { describe, it, expect } from 'vitest';
import { retentionBoundaries } from './maintenance.js';
describe('security record retention', () => {
  it('retains expired OTP records for a day and abuse counters for a week', () => {
    const dates = retentionBoundaries(new Date('2026-11-14T10:00:00Z'));
    expect(dates.sessionExpiry.toISOString()).toBe('2026-11-14T10:00:00.000Z');
    expect(dates.otpExpiry.toISOString()).toBe('2026-11-13T10:00:00.000Z');
    expect(dates.rateLimitWindow.toISOString()).toBe('2026-11-07T10:00:00.000Z');
  });
});
