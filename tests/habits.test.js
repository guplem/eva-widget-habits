// The numbers of a habit, in Node: the frequency, the streaks and the strength.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestStreaks,
  colorIndex,
  completionRate,
  frequencyChoice,
  frequencyFromChoice,
  habitColors,
  isArchived,
  isDoneValue,
  localToday,
  periodTotals,
  sortEntries,
  targetOf,
  targetText,
  weekdayOf,
  weekdayTotals,
  withDay,
  withSkip,
  coveredDays,
  currentStreak,
  dateOf,
  dayOf,
  doneDays,
  frequencyText,
  habitFacts,
  strength,
  totals,
} from "../habits.js";

const today = dayOf("2026-03-10");

/** A habit with a check on each date. */
function habit(dates, frequency = { times: 1, days: 1 }, extra = {}) {
  return { name: "Test", kind: "yesNo", frequency, checks: dates.map((date) => ({ date })), ...extra };
}

/** The dates from `from` to `to`, both included. */
function range(from, to) {
  const dates = [];
  for (let day = dayOf(from); day <= dayOf(to); day += 1) dates.push(dateOf(day));
  return dates;
}

function current(dates, frequency) {
  return currentStreak(habitFacts(habit(dates, frequency), today), today);
}

test("a date and its day number go both ways, and a wrong date names no day", () => {
  assert.equal(dateOf(dayOf("2026-02-28")), "2026-02-28");
  assert.equal(dayOf("2026-03-01") - dayOf("2026-02-28"), 1);
  assert.ok(Number.isNaN(dayOf("2026-02-31")));
  assert.ok(Number.isNaN(dayOf("yesterday")));
  assert.ok(Number.isNaN(dayOf(undefined)));
});

test("the frequency reads in words", () => {
  assert.equal(frequencyText(habit([], { times: 1, days: 1 })), "Every day");
  assert.equal(frequencyText(habit([], { times: 3, days: 7 })), "3 times a week");
  assert.equal(frequencyText(habit([], { times: 1, days: 7 })), "Once a week");
  assert.equal(frequencyText(habit([], { times: 1, days: 2 })), "Every 2 days");
  assert.equal(frequencyText(habit([], { times: 10, days: 30 })), "10 times a month");
  assert.equal(frequencyText(habit([], { times: 2, days: 5 })), "2 times in 5 days");
  assert.equal(frequencyText({ name: "No frequency" }), "Every day");
});

test("a number habit is done on a day with a value above 0, and two checks of a day add up", () => {
  const reading = {
    kind: "number",
    checks: [
      { date: "2026-03-01", value: 10 },
      { date: "2026-03-01", value: 5 },
      { date: "2026-03-02", value: 0 },
      { date: "2026-03-03" },
    ],
  };
  assert.deepEqual(
    [...doneDays(reading)],
    [
      [dayOf("2026-03-01"), 15],
      [dayOf("2026-03-03"), 1],
    ],
  );
  assert.deepEqual(totals(reading, today), { days: 2, sum: 16 });
});

test("a check after today counts for nothing yet", () => {
  const ahead = habit(["2026-03-09", "2026-03-11", "2026-03-12"]);
  assert.deepEqual(totals(ahead, today), { days: 1, sum: 1 });
  assert.deepEqual([...coveredDays(ahead, today)], [dayOf("2026-03-09")]);
});

test("a daily habit has a streak for each run of days, and today does not break it", () => {
  const facts = habitFacts(habit([...range("2026-03-01", "2026-03-03"), ...range("2026-03-05", "2026-03-09")]), today);
  assert.equal(currentStreak(facts, today), 5);
  assert.deepEqual(
    bestStreaks(facts).map(({ start, length }) => [dateOf(start), length]),
    [
      ["2026-03-05", 5],
      ["2026-03-01", 3],
    ],
  );
});

test("a missed day ends the current streak", () => {
  assert.equal(current(range("2026-03-01", "2026-03-08")), 0);
});

test("3 times a week covers each day while the last seven days hold three checks", () => {
  const gym = habit(["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09"], { times: 3, days: 7 });
  const covered = coveredDays(gym, today);
  assert.ok(!covered.has(dayOf("2026-03-05")));
  assert.ok(covered.has(dayOf("2026-03-06")));
  assert.ok(covered.has(dayOf("2026-03-08")));
  assert.ok(covered.has(dayOf("2026-03-10")));
  assert.equal(current(["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09"], { times: 3, days: 7 }), 5);
});

test("once a week breaks its streak after seven days with no check", () => {
  const weekly = { times: 1, days: 7 };
  // From 17 February to 9 March: 10 March is the eighth day after the last check.
  assert.equal(current(["2026-02-17", "2026-02-24", "2026-03-03"], weekly), 21);
  const gap = habitFacts(habit(["2026-02-17", "2026-03-02"], weekly), today);
  assert.deepEqual(
    gap.streaks.map(({ start, length }) => [dateOf(start), length]),
    [
      ["2026-02-17", 7],
      ["2026-03-02", 7],
    ],
  );
});

test("2 checks in a week do not reach 3 times a week", () => {
  assert.equal(coveredDays(habit(["2026-03-02", "2026-03-09"], { times: 3, days: 7 }), today).size, 0);
  assert.equal(current(["2026-03-02", "2026-03-09"], { times: 3, days: 7 }), 0);
});

test("the strength grows with each done day, and falls with each miss", () => {
  const month = habit(range("2026-02-08", "2026-03-10"));
  const strong = strength(month, today);
  assert.ok(strong > 0.75 && strong < 0.85, String(strong));
  const stopped = habit(range("2026-02-08", "2026-02-24"));
  assert.ok(strength(stopped, today) < strength(stopped, dayOf("2026-02-24")));
  assert.equal(strength(habit([]), today), 0);
});

test("a habit that meets its weekly target is about as strong as a daily habit done each day", () => {
  const weekly = habit(
    range("2026-01-01", "2026-03-10").filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() % 2 === 1),
    { times: 3, days: 7 },
  );
  const daily = habit(range("2026-01-01", "2026-03-10"));
  assert.ok(Math.abs(strength(weekly, today) - strength(daily, today)) < 0.05);
});

test("today counts for the strength only once it is done", () => {
  const before = habit(range("2026-03-01", "2026-03-09"));
  const after = habit(range("2026-03-01", "2026-03-10"));
  assert.equal(strength(before, today), strength(before, today - 1));
  assert.ok(strength(after, today) > strength(before, today));
});

// --- Targets, skips, rates, periods and changes ---------------------------------------------------

test("the day of the week starts on Monday, across a year and a month", () => {
  assert.equal(weekdayOf(dayOf("2026-03-09")), 0); // A Monday.
  assert.equal(weekdayOf(dayOf("2026-03-15")), 6); // A Sunday.
  assert.equal(weekdayOf(dayOf("2025-12-31")), 2); // A Wednesday.
  assert.equal(weekdayOf(dayOf("1969-12-29")), 0); // A Monday before day 0.
});

test("today follows the local clock across a clock change, and the days between stay whole", () => {
  // The days are UTC day numbers of local dates, so a 23 or a 25 hour day is still one day.
  const before = new Date(2026, 2, 28, 23, 30);
  const after = new Date(2026, 2, 30, 0, 30);
  assert.equal(dayOf(localToday(after)) - dayOf(localToday(before)), 2);
  const autumn = new Date(2026, 9, 25, 23, 59);
  assert.equal(localToday(autumn), "2026-10-25");
  // A daily streak runs over the last Sunday of March and of October.
  const facts = habitFacts(habit(range("2026-03-25", "2026-04-02")), dayOf("2026-04-02"));
  assert.equal(currentStreak(facts, dayOf("2026-04-02")), 9);
  const october = habitFacts(habit(range("2026-10-20", "2026-10-30")), dayOf("2026-10-30"));
  assert.equal(currentStreak(october, dayOf("2026-10-30")), 11);
});

test("a weekly frequency covers the days across the end of a month and of a year", () => {
  const weekly = habit(["2026-12-29", "2027-01-04"], { times: 1, days: 7 });
  const covered = coveredDays(weekly, dayOf("2027-01-12"));
  assert.ok(covered.has(dayOf("2027-01-03")));
  assert.ok(covered.has(dayOf("2027-01-10")));
  assert.ok(!covered.has(dayOf("2027-01-11")));
  const monthly = habit(["2026-01-31", "2026-02-27"], { times: 2, days: 30 });
  assert.ok(coveredDays(monthly, dayOf("2026-03-02")).has(dayOf("2026-03-01")));
});

test("every 3 days covers each day until the third day after a check", () => {
  const facts = habitFacts(habit(["2026-03-01", "2026-03-04"], { times: 1, days: 3 }), today);
  assert.deepEqual(
    facts.streaks.map(({ start, end }) => [dateOf(start), dateOf(end)]),
    [["2026-03-01", "2026-03-06"]],
  );
});

test("the frequency choice of the settings form goes both ways", () => {
  assert.deepEqual(frequencyChoice(habit([], { times: 1, days: 1 })), { choice: "daily", count: 1 });
  assert.deepEqual(frequencyChoice(habit([], { times: 3, days: 7 })), { choice: "weekly", count: 3 });
  assert.deepEqual(frequencyChoice(habit([], { times: 1, days: 3 })), { choice: "interval", count: 3 });
  assert.deepEqual(frequencyChoice(habit([], { times: 4, days: 30 })), { choice: "monthly", count: 4 });
  assert.deepEqual(frequencyChoice(habit([], { times: 2, days: 5 })), { choice: "custom", count: 2, days: 5 });
  assert.deepEqual(frequencyFromChoice("weekly", 3), { times: 3, days: 7 });
  assert.deepEqual(frequencyFromChoice("weekly", 12), { times: 7, days: 7 });
  assert.deepEqual(frequencyFromChoice("interval", "4"), { times: 1, days: 4 });
  assert.deepEqual(frequencyFromChoice("monthly", 0), { times: 1, days: 30 });
  assert.deepEqual(frequencyFromChoice("custom", 9, 5), { times: 5, days: 5 });
  assert.deepEqual(frequencyFromChoice("daily", 5), { times: 1, days: 1 });
  assert.deepEqual(frequencyFromChoice("weekly", "x"), { times: 1, days: 7 });
});

test("a number habit with a target is done only when the day meets it", () => {
  const read = { kind: "number", unit: "pages", target: { value: 20, type: "atLeast" }, checks: [] };
  assert.equal(isDoneValue(read, 25), true);
  assert.equal(isDoneValue(read, 10), false);
  assert.equal(targetText(read), "At least 20 pages");
  const coffee = { kind: "number", unit: "cups", target: { value: 2, type: "atMost" } };
  assert.equal(isDoneValue(coffee, 0), true);
  assert.equal(isDoneValue(coffee, 3), false);
  assert.equal(targetText(coffee), "At most 2 cups");
  // A broken target, or a target on a yes or no habit, is no target.
  assert.equal(targetOf({ kind: "number", target: { value: "a lot" } }), null);
  assert.equal(targetOf({ kind: "yesNo", target: { value: 3 } }), null);
  assert.deepEqual(targetOf({ kind: "number", target: { value: 5 } }), { value: 5, type: "atLeast" });
});

test("a day under an at-least target counts in part for the strength, but breaks the streak", () => {
  const days = range("2026-02-01", "2026-03-10");
  const full = { kind: "number", target: { value: 20 }, checks: days.map((date) => ({ date, value: 20 })) };
  const half = { kind: "number", target: { value: 20 }, checks: days.map((date) => ({ date, value: 10 })) };
  const none = { kind: "number", target: { value: 20 }, checks: [] };
  const halfFacts = habitFacts(half, today);
  assert.equal(halfFacts.streaks.length, 0);
  assert.ok(halfFacts.strength > strength(none, today));
  assert.ok(halfFacts.strength < strength(full, today));
  assert.deepEqual(halfFacts.total, { days: 0, sum: days.length * 10 });
});

test("a skipped day keeps the streak and leaves the strength as it is", () => {
  const dates = range("2026-03-01", "2026-03-09").filter((date) => date !== "2026-03-05");
  const withSkipDay = habit(dates, undefined, { skips: [{ date: "2026-03-05", note: "Sick" }] });
  const facts = habitFacts(withSkipDay, today);
  assert.equal(currentStreak(facts, today), 9);
  assert.deepEqual([...facts.skipped], [dayOf("2026-03-05")]);
  assert.equal(facts.total.days, 8);
  const missed = habitFacts(habit(dates), today);
  assert.ok(facts.strength > missed.strength);
  // A done day wins over a skip of the same day, and a skip after today counts for nothing yet.
  const both = habitFacts(
    habit(["2026-03-09"], undefined, { skips: [{ date: "2026-03-09" }, { date: "2026-03-12" }] }),
    today,
  );
  assert.equal(both.skipped.size, 0);
});

test("the completion rate divides the done days by the days that the frequency asks for", () => {
  const daily = habit(range("2026-02-01", "2026-03-09").filter((date) => date !== "2026-03-04"));
  const facts = habitFacts(daily, today);
  // Today is not done yet, so the week is 3 to 9 March: 6 of 7 days.
  assert.equal(completionRate(daily, facts, today, 7), 6 / 7);
  assert.equal(completionRate(daily, facts, today, null), 36 / 37);
  const weekly = habit(["2026-03-03", "2026-03-05", "2026-03-08"], { times: 3, days: 7 });
  assert.equal(completionRate(weekly, habitFacts(weekly, today), today, 7), 1);
  // Before the first check there is nothing to count.
  assert.equal(completionRate(habit([]), habitFacts(habit([]), today), today, 7), null);
  const fresh = habit(["2026-03-10"]);
  assert.equal(completionRate(fresh, habitFacts(fresh, today), today, 30), 1);
  // A skipped day leaves the period.
  const skipped = habit(["2026-03-08", "2026-03-09"], undefined, { skips: [{ date: "2026-03-07" }] });
  assert.equal(completionRate(skipped, habitFacts(skipped, today), today, 7), 1);
});

test("the totals of each week start on Monday, and each month on its first day", () => {
  const daily = habit(range("2026-02-20", "2026-03-10"));
  const facts = habitFacts(daily, today);
  const weeks = periodTotals(facts, today, "week", 3);
  assert.deepEqual(
    weeks.map(({ start, end, done }) => [dateOf(start), dateOf(end), done]),
    [
      ["2026-02-23", "2026-03-01", 7],
      ["2026-03-02", "2026-03-08", 7],
      ["2026-03-09", "2026-03-15", 2],
    ],
  );
  const months = periodTotals(facts, today, "month", 3);
  assert.deepEqual(
    months.map(({ start, end, done }) => [dateOf(start), dateOf(end), done]),
    [
      ["2026-01-01", "2026-01-31", 0],
      ["2026-02-01", "2026-02-28", 9],
      ["2026-03-01", "2026-03-31", 10],
    ],
  );
  const reading = {
    kind: "number",
    checks: [
      { date: "2026-03-02", value: 12 },
      { date: "2026-03-03", value: 8 },
    ],
  };
  assert.equal(periodTotals(habitFacts(reading, today), today, "week", 1)[0].sum, 0);
  assert.equal(periodTotals(habitFacts(reading, today), today, "month", 1)[0].sum, 20);
  // A year boundary.
  const january = periodTotals(habitFacts(habit([]), dayOf("2027-01-05")), dayOf("2027-01-05"), "month", 2);
  assert.deepEqual(
    january.map(({ start }) => dateOf(start)),
    ["2026-12-01", "2027-01-01"],
  );
});

test("the done days of each day of the week count Monday first", () => {
  const facts = habitFacts(habit(["2026-03-02", "2026-03-09", "2026-03-08"]), today);
  assert.deepEqual(weekdayTotals(facts, today), [2, 0, 0, 0, 0, 0, 1]);
});

test("a check of a past day keeps the other fields of the habit and of the check", () => {
  const base = { name: "Read", kind: "yesNo", shelf: "kitchen", checks: [{ date: "2026-03-01", note: "Good" }] };
  assert.deepEqual(withDay(base, "2026-03-02", true).checks, [
    { date: "2026-03-01", note: "Good" },
    { date: "2026-03-02" },
  ]);
  assert.equal(withDay(base, "2026-03-02", true).shelf, "kitchen");
  assert.deepEqual(withDay(base, "2026-03-01", null).checks, []);
  assert.deepEqual(withDay(base, "2026-03-01", true).checks, [{ date: "2026-03-01", note: "Good" }]);
  const run = {
    kind: "number",
    checks: [
      { date: "2026-03-01", value: 3, note: "x" },
      { date: "2026-03-01", value: 2 },
    ],
  };
  assert.deepEqual(withDay(run, "2026-03-01", 7).checks, [{ date: "2026-03-01", value: 7, note: "x" }]);
});

test("a skip removes the checks of its day, a check removes its skip, and the last skip leaves no empty list", () => {
  const base = { name: "Walk", kind: "yesNo", checks: [{ date: "2026-03-01" }] };
  const skipped = withSkip(base, "2026-03-01", true);
  assert.deepEqual(skipped.checks, []);
  assert.deepEqual(skipped.skips, [{ date: "2026-03-01" }]);
  assert.deepEqual(withSkip(skipped, "2026-03-01", true).skips, [{ date: "2026-03-01" }]);
  assert.equal("skips" in withSkip(skipped, "2026-03-01", false), false);
  assert.deepEqual(withDay(skipped, "2026-03-01", true), {
    name: "Walk",
    kind: "yesNo",
    checks: [{ date: "2026-03-01" }],
  });
  assert.equal(withSkip(base, "2026-03-05", false), base);
});

test("a colour of the file maps to the nearest colour of the palette", () => {
  assert.equal(colorIndex({ color: habitColors[3] }), 3);
  assert.equal(colorIndex({ color: "#3b83f7" }), habitColors.indexOf("#3b82f6"));
  assert.equal(colorIndex({ color: "blue" }), null);
  assert.equal(colorIndex({}), null);
});

test("the list sorts by name, strength, what is left to do, and colour", () => {
  const entries = [
    { file: "b.json", habit: { name: "beta", color: habitColors[5], checks: [{ date: "2026-03-10" }] } },
    { file: "a.json", habit: { name: "Alpha", color: habitColors[1], checks: [] } },
    { file: "c.json", habit: { name: "Gamma", checks: range("2026-01-01", "2026-03-09").map((date) => ({ date })) } },
  ];
  const names = (order) => sortEntries(entries, order, today).map((entry) => entry.habit.name);
  assert.deepEqual(names("name"), ["Alpha", "beta", "Gamma"]);
  assert.deepEqual(names("strength"), ["Gamma", "beta", "Alpha"]);
  assert.deepEqual(names("status"), ["Alpha", "Gamma", "beta"]);
  assert.deepEqual(names("color"), ["Alpha", "beta", "Gamma"]);
  assert.deepEqual(names("unknown"), ["Alpha", "beta", "Gamma"]);
});

test("an archived habit says so, and a file of the old version reads as before", () => {
  assert.equal(isArchived({ archived: true }), true);
  assert.equal(isArchived({ archived: "yes" }), false);
  const old = { name: "Old", kind: "yesNo", frequency: { times: 1, days: 1 }, checks: [{ date: "2026-03-09" }] };
  const facts = habitFacts(old, today);
  assert.equal(facts.skipped.size, 0);
  assert.equal(currentStreak(facts, today), 1);
});
