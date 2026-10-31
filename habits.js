// The numbers of a habit: which days are done, the streaks and the strength. This file reads no
// page and no network, so the unit tests of tests/habits.test.js run it in Node.
//
// A habit file holds `frequency: { times, days }`, read as "`times` in `days`", and a list of
// checks, each with a `date` and, for a number habit, a `value`.

const dayMs = 86_400_000;

/**
 * The strength moves half of the way to its target in this many days. So two weeks of checks
 * build a strong habit, and two weeks of misses halve it.
 */
const strengthHalfLifeDays = 14;
const strengthStep = 1 - 0.5 ** (1 / strengthHalfLifeDays);

/** The day number of a `YYYY-MM-DD` date: days since 1970-01-01. NaN for any other text. */
export function dayOf(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN;
  const [year, month, day] = date.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  const back = new Date(time);
  // Date.UTC rolls 2026-02-31 over to March: such a date names no day.
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return Number.NaN;
  return time / dayMs;
}

/** The `YYYY-MM-DD` date of a day number. */
export function dateOf(day) {
  return new Date(day * dayMs).toISOString().slice(0, 10);
}

/** Today in the visitor's time zone, as `YYYY-MM-DD`. */
export function localToday(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/** The frequency of a habit, with safe values: once a day when the file has none. */
export function frequencyOf(habit) {
  const times = Number.isInteger(habit?.frequency?.times) && habit.frequency.times >= 1 ? habit.frequency.times : 1;
  const days = Number.isInteger(habit?.frequency?.days) && habit.frequency.days >= 1 ? habit.frequency.days : 1;
  // "5 times in 3 days" cannot happen: at most one done day counts for each day.
  return { times: Math.min(times, days), days };
}

/** The frequency in words, such as "Every day" or "3 times a week". */
export function frequencyText(habit) {
  const { times, days } = frequencyOf(habit);
  if (times === days) return "Every day";
  if (days === 7) return times === 1 ? "Once a week" : `${String(times)} times a week`;
  if (days === 30 || days === 31) return times === 1 ? "Once a month" : `${String(times)} times a month`;
  if (times === 1) return `Every ${String(days)} days`;
  return `${String(times)} times in ${String(days)} days`;
}

export function checksOf(habit) {
  return Array.isArray(habit?.checks) ? habit.checks : [];
}

export function isNumberHabit(habit) {
  return habit?.kind === "number";
}

/**
 * The value of each done day, by day number. A yes or no check counts as 1. A number check counts
 * with its value, and a day with two checks adds them up. A value of 0 or less is not done.
 */
export function doneDays(habit) {
  const values = new Map();
  for (const check of checksOf(habit)) {
    const day = dayOf(check?.date);
    if (Number.isNaN(day)) continue;
    const value = isNumberHabit(habit) && typeof check.value === "number" ? check.value : 1;
    values.set(day, (values.get(day) ?? 0) + value);
  }
  for (const [day, value] of values) if (!(value > 0)) values.delete(day);
  return values;
}

/** The check of this date, or undefined. */
export function checkOn(habit, date) {
  return checksOf(habit).find((check) => check?.date === date);
}

/**
 * Each day that the frequency covers, up to `today`. A day is covered when it lies in a window of
 * `days` days with `times` done days at least. So for "3 times a week", a week with three checks
 * covers all of its days, and the days between two checks do not break a streak.
 */
export function coveredDays(habit, today) {
  const done = doneDays(habit);
  const { times, days } = frequencyOf(habit);
  const covered = new Set();
  if (done.size === 0) return covered;
  const first = Math.min(...done.keys());
  for (let start = first - days + 1; start <= today; start += 1) {
    let count = 0;
    for (let day = start; day < start + days; day += 1) if (done.has(day)) count += 1;
    if (count < times) continue;
    for (let day = Math.max(start, first); day < start + days && day <= today; day += 1) covered.add(day);
  }
  return covered;
}

/** Each streak: a run of covered days, as `{ start, end, length }` in day numbers, oldest first. */
export function streaks(habit, today) {
  const days = [...coveredDays(habit, today)].sort((a, b) => a - b);
  const runs = [];
  for (const day of days) {
    const last = runs.at(-1);
    if (last !== undefined && day === last.end + 1) {
      last.end = day;
      last.length += 1;
    } else {
      runs.push({ start: day, end: day, length: 1 });
    }
  }
  return runs;
}

/**
 * The streak that is still running: it ends today, or yesterday, because the day is not over
 * yet. Its length is 0 when no streak runs.
 */
export function currentStreak(habit, today) {
  const last = streaks(habit, today).at(-1);
  return last !== undefined && last.end >= today - 1 ? last.length : 0;
}

/** The longest streaks, longest first, and the newest first among equal ones. */
export function bestStreaks(habit, today, count = 5) {
  return streaks(habit, today)
    .sort((a, b) => b.length - a.length || b.end - a.end)
    .slice(0, count);
}

/**
 * The strength of the habit on `today`, from 0 to 1. It starts at 0 on the first check. Each day
 * moves it a step toward the part of the target that the habit reached in the window that ends
 * on that day. Today counts only when it is done, because the day is not over yet.
 */
export function strength(habit, today) {
  const done = doneDays(habit);
  if (done.size === 0) return 0;
  const { times, days } = frequencyOf(habit);
  const first = Math.min(...done.keys());
  let score = 0;
  let inWindow = 0;
  for (let day = first; day <= today; day += 1) {
    if (done.has(day)) inWindow += 1;
    if (done.has(day - days)) inWindow -= 1;
    if (day === today && !done.has(day)) break;
    score += (Math.min(1, inWindow / times) - score) * strengthStep;
  }
  return score;
}

/** The total of the done days, and for a number habit the sum of the values. */
export function totals(habit) {
  const done = doneDays(habit);
  let sum = 0;
  for (const value of done.values()) sum += value;
  return { days: done.size, sum };
}
