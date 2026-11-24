import { MAX_BOOKING_HOURS, SLOT_MS, slotsFor } from '../../src/utils/slots';

const at = (hour: number, minute = 0) => new Date(Date.UTC(2030, 0, 1, hour, minute));

describe('slotsFor (the time slots a booking claims)', () => {
  it('claims one slot for every 30 minutes', () => {
    expect(slotsFor(at(10), at(10, 30))).toHaveLength(1);
    expect(slotsFor(at(10), at(11))).toHaveLength(2);
    expect(slotsFor(at(10), at(12))).toHaveLength(4);
  });

  it('numbers slots as minutes since 1970 divided by 30', () => {
    expect(slotsFor(at(10), at(10, 30))[0]).toBe(at(10).getTime() / SLOT_MS);
  });

  it('gives consecutive numbers to consecutive slots', () => {
    const [first, second] = slotsFor(at(10), at(11));
    expect(second - first).toBe(1);
  });

  it('makes overlapping bookings share a slot (this is what the database unique index catches)', () => {
    const a = slotsFor(at(10), at(11)); // 10:00 and 10:30
    const b = slotsFor(at(10, 30), at(11, 30)); // 10:30 and 11:00
    expect(a.filter((slot) => b.includes(slot))).toHaveLength(1);
  });

  it('makes back-to-back bookings share nothing', () => {
    const a = slotsFor(at(10), at(11));
    const b = slotsFor(at(11), at(12));
    expect(a.filter((slot) => b.includes(slot))).toHaveLength(0);
  });

  it('the longest allowed booking claims 16 slots', () => {
    expect(slotsFor(at(8), at(8 + MAX_BOOKING_HOURS))).toHaveLength(16);
  });
});
