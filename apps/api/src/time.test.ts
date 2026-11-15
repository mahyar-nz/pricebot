import { expect, it } from 'vitest';
import { tehranDayStart } from './time.js';
it.each([
  ['2026-11-15T00:00:00Z','2026-11-14T20:30:00.000Z'],
  ['2026-11-15T20:29:59Z','2026-11-14T20:30:00.000Z'],
  ['2026-11-15T20:30:00Z','2026-11-15T20:30:00.000Z'],
])('applies the Tehran daily safety window at %s',(now,start)=>{
  expect(tehranDayStart(new Date(now)).toISOString()).toBe(start);
});
