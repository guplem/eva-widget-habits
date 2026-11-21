// The numbers of a habit: which days are done, the streaks, the rates and the strength. This file
// reads no page and no network, so the unit tests of tests/habits.test.js run it in Node.
//
// A habit file holds `frequency: { times, days }`, read as "`times` in `days`", a list of checks,
// each with a `date` and, for a number habit, a `value`, and a list of skipped days. A day is a
// number here: days since 1970-01-01, counted in UTC, so a clock change never adds or loses a day.

const dayMs = 86_400_000;

/**
 * The strength moves half of the way to its target in this many days. So two weeks of checks
 * build a strong habit, and two weeks of misses halve it.
 */
export const strengthHalfLifeDays = 14;
const strengthStep = 1 - 0.5 ** (1 / strengthHalfLifeDays);

/** The colours that a person can give a habit. A file can hold another colour: `colorIndex` maps it. */
export const habitColors = ["#d64545", "#e07b26", "#c9a227", "#3f9c4f", "#2a9d8f", "#3b82f6", "#7c5cd6", "#d0558f"];
export const habitColorNames = ["Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Violet", "Pink"];

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

/** The day of the week of a day number: 0 on a Monday, 6 on a Sunday. Day 0 was a Thursday. */
export function weekdayOf(day) {
  return (((day + 3) % 7) + 7) % 7;
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

/**
 * The kind of frequency that the settings form shows: `daily`, `weekly` ("N times a week"),
 * `monthly` ("N times a month"), `interval` ("every N days") or `custom`, with its number.
 */
export function frequencyChoice(habit) {
  const { times, days } = frequencyOf(habit);
  if (times === days) return { choice: "daily", count: 1 };
  if (days === 7) return { choice: "weekly", count: times };
  if (days === 30) return { choice: "monthly", count: times };
  if (times === 1) return { choice: "interval", count: days };
  return { choice: "custom", count: times, days };
}

/** The `frequency` object of a choice of the settings form. A bad number becomes the nearest good one. */
export function frequencyFromChoice(choice, count, customDays = 1) {
  const whole = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value)) || min));
  if (choice === "weekly") return { times: whole(count, 1, 7), days: 7 };
  if (choice === "monthly") return { times: whole(count, 1, 30), days: 30 };
  if (choice === "interval") return { times: 1, days: whole(count, 1, 365) };
  if (choice === "custom") {
    const days = whole(customDays, 1, 365);
    return { times: whole(count, 1, days), days };
  }
  return { times: 1, days: 1 };
}

export function checksOf(habit) {
  return Array.isArray(habit?.checks) ? habit.checks : [];
}

export function skipsOf(habit) {
  return Array.isArray(habit?.skips) ? habit.skips : [];
}

export function isNumberHabit(habit) {
  return habit?.kind === "number";
}

export function isArchived(habit) {
  return habit?.archived === true;
}

/**
 * The target of a number habit: `{ value, type }`, where `type` is `atLeast` or `atMost`. Null
 * for a yes or no habit, or a number habit with no usable target: then any value above 0 is done.
 */
export function targetOf(habit) {
  if (!isNumberHabit(habit)) return null;
  const value = habit?.target?.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const type = habit.target.type === "atMost" ? "atMost" : "atLeast";
  // "At least 0" is any value: the plain rule says the same, and gives no partial credit.
  if (type === "atLeast" && value === 0) return null;
  return { value, type };
}

/** The target in words, such as "At least 15 minutes", or "" with no target. */
export function targetText(habit) {
  const target = targetOf(habit);
  if (target === null) return "";
  const unit = typeof habit.unit === "string" && habit.unit.trim() !== "" ? ` ${habit.unit.trim()}` : "";
  return `${target.type === "atMost" ? "At most" : "At least"} ${String(target.value)}${unit}`;
}

/** Whether the value of a day, the sum of its checks, meets the habit. */
export function isDoneValue(habit, value) {
  const target = targetOf(habit);
  if (target === null) return value > 0;
  return target.type === "atMost" ? value <= target.value : value >= target.value;
}

/**
 * The value of each day with a check, by day number. A yes or no check counts as 1. A number
 * check counts with its value, and a day with two checks adds them up.
 */
export function checkedDays(habit) {
  const values = new Map();
  for (const check of checksOf(habit)) {
    const day = dayOf(check?.date);
    if (Number.isNaN(day)) continue;
    const value = isNumberHabit(habit) && typeof check.value === "number" ? check.value : 1;
    values.set(day, (values.get(day) ?? 0) + value);
  }
  return values;
}

/** The value of each done day, by day number: each checked day whose value meets the habit. */
export function doneDays(habit) {
  const values = checkedDays(habit);
  for (const [day, value] of values) if (!isDoneValue(habit, value)) values.delete(day);
  return values;
}

/** The days that the person skipped, such as a sick day: neither done nor missed. */
export function skippedDays(habit) {
  const days = new Set();
  for (const skip of skipsOf(habit)) {
    const day = dayOf(skip?.date);
    if (!Number.isNaN(day)) days.add(day);
  }
  return days;
}

/** The check of this date, or undefined. */
export function checkOn(habit, date) {
  return checksOf(habit).find((check) => check?.date === date);
}

/**
 * How much a done or checked day counts toward the strength, from 0 to 1. A day under an "at
 * least" target counts for its part of the target, so 10 of 15 minutes is better than nothing.
 */
function credit(habit, value) {
  if (isDoneValue(habit, value)) return 1;
  const target = targetOf(habit);
  if (target?.type === "atLeast" && value > 0) return Math.min(1, value / target.value);
  return 0;
}

/**
 * Every number of a habit on `today`, computed in one pass over its days. A check or a skip dated
 * after today counts for nothing yet.
 *
 * - `done`: the value of each done day, as `doneDays` gives it.
 * - `checked`: the value of each day with a check, done or not, such as 10 of 15 minutes.
 * - `skipped`: each skipped day that is not done.
 * - `covered`: each day that meets the frequency. A day is covered when the window of `days` days
 *   that ends on it holds `times` done or skipped days at least. So "3 times a week" covers each
 *   day while the last seven days hold three checks, and a day with no check between them keeps
 *   the streak.
 * - `streaks`: each run of covered days, as `{ start, end, length }` in day numbers, oldest first.
 * - `strength`: from 0 to 1. See README.md, "How it counts".
 * - `total`: the done days, and for a number habit the sum of the values of every checked day.
 * - `first`: the first day with a check or a skip, or null.
 */
export function habitFacts(habit, today) {
  const checked = checkedDays(habit);
  for (const day of checked.keys()) if (day > today) checked.delete(day);
  const done = new Map([...checked].filter(([, value]) => isDoneValue(habit, value)));
  const skipped = skippedDays(habit);
  for (const day of skipped) if (day > today || done.has(day)) skipped.delete(day);
  const { times, days } = frequencyOf(habit);
  const covered = new Set();
  const runs = [];
  let score = 0;
  let sum = 0;
  for (const value of checked.values()) sum += value;
  const starts = [...checked.keys(), ...skipped];
  const first = starts.length > 0 ? Math.min(...starts) : null;
  if (first !== null) {
    // The window counts done and skipped days for the frequency, and the credits for the strength.
    let inWindow = 0;
    let creditInWindow = 0;
    const creditOf = (day) => (skipped.has(day) ? 1 : checked.has(day) ? credit(habit, checked.get(day)) : 0);
    for (let day = first; day <= today; day += 1) {
      if (done.has(day) || skipped.has(day)) inWindow += 1;
      if (done.has(day - days) || skipped.has(day - days)) inWindow -= 1;
      creditInWindow += creditOf(day) - creditOf(day - days);
      const isCovered = inWindow >= times;
      if (isCovered) {
        covered.add(day);
        const last = runs.at(-1);
        if (last !== undefined && last.end === day - 1) {
          last.end = day;
          last.length += 1;
        } else {
          runs.push({ start: day, end: day, length: 1 });
        }
      }
      // Today is not over: it moves the strength only once it is covered. A skipped day never does.
      if (day === today && !isCovered) break;
      if (skipped.has(day)) continue;
      score += (Math.min(1, creditInWindow / times) - score) * strengthStep;
    }
  }
  return { done, checked, skipped, covered, streaks: runs, strength: score, total: { days: done.size, sum }, first };
}

export function coveredDays(habit, today) {
  return habitFacts(habit, today).covered;
}

export function strength(habit, today) {
  return habitFacts(habit, today).strength;
}

export function totals(habit, today) {
  return habitFacts(habit, today).total;
}

/**
 * The streak that is still running: it ends today, or yesterday, because the day is not over
 * yet. Its length is 0 when no streak runs.
 */
export function currentStreak(facts, today) {
  const last = facts.streaks.at(-1);
  return last !== undefined && last.end >= today - 1 ? last.length : 0;
}

/** The longest streaks, longest first, and the newest first among equal ones. */
export function bestStreaks(facts, count = 5) {
  return [...facts.streaks].sort((a, b) => b.length - a.length || b.end - a.end).slice(0, count);
}

/** The periods of the completion rate, by the number of days that each looks back. */
export const ratePeriods = [
  { id: "week", name: "Week", days: 7 },
  { id: "month", name: "Month", days: 30 },
  { id: "year", name: "Year", days: 365 },
  { id: "all", name: "All", days: null },
];

/**
 * The completion rate over the last `periodDays` days, or since the first check with null: the
 * done days, divided by the done days that the frequency asks for in those days. So a daily habit
 * done 6 of 7 days scores 86%, and "3 times a week" done 3 times in 7 days scores 100%. A skipped
 * day leaves the period. The period ends today once today is done or skipped, and yesterday
 * otherwise, because the day is not over.
 * The rate stops at 1. Null when the period holds no day yet, such as before the first check.
 */
export function completionRate(habit, facts, today, periodDays = null) {
  if (facts.first === null) return null;
  const end = facts.done.has(today) || facts.skipped.has(today) ? today : today - 1;
  const start = periodDays === null ? facts.first : Math.max(facts.first, end - periodDays + 1);
  if (end < start) return null;
  let length = 0;
  let doneCount = 0;
  for (let day = start; day <= end; day += 1) {
    if (facts.skipped.has(day)) continue;
    length += 1;
    if (facts.done.has(day)) doneCount += 1;
  }
  if (length === 0) return null;
  const { times, days } = frequencyOf(habit);
  return Math.min(1, doneCount / ((length * times) / days));
}

/** The first day of the week (a Monday) or of the month of a day number. */
export function periodStart(day, unit) {
  if (unit === "week") return day - weekdayOf(day);
  const date = new Date(day * dayMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / dayMs;
}

/** The first day of the period after the one that starts on `start`. */
function nextPeriod(start, unit) {
  if (unit === "week") return start + 7;
  const date = new Date(start * dayMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / dayMs;
}

/**
 * The last `count` weeks (Monday first) or months up to today, oldest first. Each has its `start`
 * day, its `end` day, the done days in it, and the sum of the values of its checked days.
 */
export function periodTotals(facts, today, unit, count) {
  const starts = [periodStart(today, unit)];
  while (starts.length < count) starts.unshift(periodStart(starts[0] - 1, unit));
  return starts.map((start) => {
    const end = nextPeriod(start, unit) - 1;
    let doneCount = 0;
    let sum = 0;
    for (let day = start; day <= Math.min(end, today); day += 1) {
      if (facts.done.has(day)) doneCount += 1;
      sum += facts.checked.get(day) ?? 0;
    }
    return { start, end, done: doneCount, sum };
  });
}

/** The done days of each day of the week, Monday first, in the last `lookBack` days. */
export function weekdayTotals(facts, today, lookBack = 365) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const day of facts.done.keys()) if (day > today - lookBack) counts[weekdayOf(day)] += 1;
  return counts;
}

/** The index in `habitColors` of a habit's colour: the nearest one for another `#rrggbb` colour. Null with no colour. */
export function colorIndex(habit) {
  const color = habit?.color;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const [red, green, blue] = rgb(color);
  let best = 0;
  let bestDistance = Infinity;
  habitColors.forEach((candidate, index) => {
    const [r, g, b] = rgb(candidate);
    const distance = (r - red) ** 2 + (g - green) ** 2 + (b - blue) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

// --- Changes: each returns a new habit, with every field that it does not change --------------

/**
 * The habit with `value` as the value of `date`, in one check. The first check of that date keeps
 * its other fields, such as a note. `null` removes the checks of that date. A yes or no habit
 * takes `true` for a check. A check also ends a skip of the same date.
 */
export function withDay(habit, date, value) {
  const checks = checksOf(habit);
  const first = checks.find((check) => check?.date === date);
  const others = checks.filter((check) => check?.date !== date);
  const next = withSkip(habit, date, false);
  if (value === null) return { ...next, checks: others };
  if (isNumberHabit(habit)) return { ...next, checks: [...others, { ...(first ?? { date }), value }] };
  const kept = { ...(first ?? { date }) };
  delete kept.value;
  return { ...next, checks: [...others, kept] };
}

/** The habit with `date` skipped, or not. A skip removes the checks of the date. */
export function withSkip(habit, date, isSkipped) {
  const skips = skipsOf(habit);
  const has = skips.some((skip) => skip?.date === date);
  if (!isSkipped) {
    if (!has) return habit;
    const kept = skips.filter((skip) => skip?.date !== date);
    if (kept.length > 0) return { ...habit, skips: kept };
    const rest = { ...habit };
    delete rest.skips;
    return rest;
  }
  const checks = checksOf(habit).filter((check) => check?.date !== date);
  return { ...habit, checks, skips: has ? skips : [...skips, { date }] };
}

/** The ways to sort the list, by id. */
export const sortOrders = [
  { id: "name", name: "Name" },
  { id: "strength", name: "Strength" },
  { id: "status", name: "To do first" },
  { id: "color", name: "Colour" },
];

/**
 * The entries `{ file, habit }` in a sort order. "To do first" puts the habits not done today
 * first. Each order breaks a tie by name, then by file.
 */
export function sortEntries(entries, order, today) {
  const name = (entry) => String(entry.habit.name).toLocaleLowerCase("en");
  const byName = (a, b) => name(a).localeCompare(name(b), "en") || a.file.localeCompare(b.file);
  const key = {
    strength: (entry) => -habitFacts(entry.habit, today).strength,
    status: (entry) => {
      const facts = habitFacts(entry.habit, today);
      return facts.done.has(today) || facts.skipped.has(today) ? 1 : 0;
    },
    color: (entry) => colorIndex(entry.habit) ?? habitColors.length,
  }[order];
  const keys = new Map(entries.map((entry) => [entry, key === undefined ? 0 : key(entry)]));
  return [...entries].sort((a, b) => keys.get(a) - keys.get(b) || byName(a, b));
}
