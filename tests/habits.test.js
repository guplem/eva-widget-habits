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
  assert.deepEqual(totals(reading), { days: 2, sum: 16 });
});

test("a daily habit has a streak for each run of days, and today does not break it", () => {
  const walk = habit([...range("2026-03-01", "2026-03-03"), ...range("2026-03-05", "2026-03-09")]);
  assert.equal(currentStreak(walk, today), 5);
  assert.deepEqual(
    bestStreaks(walk, today).map(({ start, length }) => [dateOf(start), length]),
    [
      ["2026-03-05", 5],
      ["2026-03-01", 3],
    ],
  );
});

test("a missed day ends the current streak", () => {
  assert.equal(currentStreak(habit(range("2026-03-01", "2026-03-08")), today), 0);
});

test("3 times a week covers the days between the checks", () => {
  const gym = habit(["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09"], { times: 3, days: 7 });
  const covered = coveredDays(gym, today);
  assert.ok(covered.has(dayOf("2026-03-03")));
  assert.ok(covered.has(dayOf("2026-03-10")));
  assert.equal(currentStreak(gym, today), 9);
});

test("2 checks in a week do not reach 3 times a week", () => {
  const gym = habit(["2026-03-02", "2026-03-09"], { times: 3, days: 7 });
  assert.equal(coveredDays(gym, today).size, 0);
  assert.equal(currentStreak(gym, today), 0);
});

test("the strength grows with each done day, and falls with each miss", () => {
  const month = habit(range("2026-02-08", "2026-03-10"));
  const strong = strength(month, today);
  assert.ok(strong > 0.75 && strong < 0.85, String(strong));
  const stopped = habit(range("2026-02-08", "2026-02-24"));
  assert.ok(strength(stopped, today) < strength(habit(range("2026-02-08", "2026-02-24")), dayOf("2026-02-24")));
  assert.equal(strength(habit([]), today), 0);
});

test("a habit that meets its weekly target is as strong as a daily habit done each day", () => {
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
