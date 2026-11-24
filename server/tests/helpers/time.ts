const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// A UTC time string "daysAhead" days from today, for example isoIn(3, 10, 30) = in 3 days at 10:30 UTC
export function isoIn(daysAhead: number, hour: number, minute = 0): string {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const time = new Date(midnight.getTime() + daysAhead * DAY + hour * HOUR + minute * 60_000);
  return time.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR);
export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);
