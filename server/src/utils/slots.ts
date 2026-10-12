// Time is cut into fixed 30-minute slots. Every booking claims the slots it covers,
// and the database refuses two active bookings for the same resource + slot.
export const SLOT_MS = 30 * 60 * 1000;
export const MAX_BOOKING_HOURS = 8;
export const MAX_DAYS_AHEAD = 90;

// Slot number = minutes since 1970 / 30. A 10:00-11:00 booking claims 2 slots.
export function slotsFor(start: Date, end: Date): number[] {
  const slots: number[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MS) {
    slots.push(t / SLOT_MS);
  }
  return slots;
}
