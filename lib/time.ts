export function localDate(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function localClock(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function isValidTimeZone(value: string) {
  try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; }
}

export function streakFromDates(dates: string[], today: string) {
  const complete = new Set(dates);
  let current = 0;
  let cursor = today;
  while (complete.has(cursor)) { current++; cursor = shiftDate(cursor, -1); }
  const sorted = [...complete].sort();
  let longest = 0, run = 0, previous = "";
  for (const date of sorted) {
    run = previous && shiftDate(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run); previous = date;
  }
  return { current, longest };
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
