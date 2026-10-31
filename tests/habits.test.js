// The numbers of a habit, in Node: the frequency, the streaks and the strength.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestStreaks,
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
