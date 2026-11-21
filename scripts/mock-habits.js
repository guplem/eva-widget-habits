// Writes the made-up habits of data/habits/ for the demo and the tests: `node scripts/mock-habits.js`.
// A seeded random walk gives each habit runs of done and missed days, so every view has something
// to show. The checks go until the end of 2028, so the demo keeps a recent history for years.
// Run it again only to change the mock habits: the output is the same each time.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dateOf, dayOf, weekdayOf } from "../habits.js";
import { format } from "prettier";

const options = JSON.parse(await readFile(new URL("../.prettierrc.json", import.meta.url), "utf8"));

const folder = fileURLToPath(new URL("../data/habits/", import.meta.url));
const first = dayOf("2025-10-01");
const last = dayOf("2028-12-31");

/** A small seeded random number generator (mulberry32), so each run writes the same files. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The days of a habit from `start` to `end`: a day is done with the chance `keep` after a done
 * day, and `restart` after a missed one, so runs form. `wanted(day)` can rule a day out.
 */
function walk({ seed, start = first, end = last, keep, restart, skip = 0, wanted = () => true }) {
  const next = random(seed);
  const done = [];
  const skipped = [];
  let wasDone = true;
  for (let day = start; day <= end; day += 1) {
    if (!wanted(day)) continue;
    if (next() < skip) {
      skipped.push(day);
      continue;
    }
    wasDone = next() < (wasDone ? keep : restart);
    if (wasDone) done.push(day);
  }
  return { done, skipped, next };
}

const habits = {
  "meditate.json": () => {
    const { done, skipped, next } = walk({ seed: 1, keep: 0.86, restart: 0.55, skip: 0.02 });
    return {
      name: "Meditate",
      kind: "number",
      question: "How many minutes did you meditate today?",
      unit: "minutes",
      target: { value: 10, type: "atLeast" },
      frequency: { times: 1, days: 1 },
      color: "#7c5cd6",
      checks: done.map((day) => ({ date: dateOf(day), value: [5, 8, 10, 10, 12, 15, 15, 20][Math.floor(next() * 8)] })),
      skips: skipped.map((day) => ({ date: dateOf(day), note: "Ill" })),
      note: "After breakfast, on the cushion by the window.",
    };
  },
  "read.json": () => {
    const { done } = walk({ seed: 2, keep: 0.9, restart: 0.5 });
    return {
      name: "Read",
      kind: "yesNo",
      question: "Did you read 20 pages today?",
      frequency: { times: 1, days: 1 },
      color: "#3b82f6",
      checks: done.map((day) => ({ date: dateOf(day) })),
      tags: ["evening"],
    };
  },
  "walk.json": () => {
    // Three walks a week, mostly on Monday, Wednesday and Saturday.
    const { done } = walk({ seed: 3, keep: 0.8, restart: 0.75, wanted: (day) => [0, 2, 5].includes(weekdayOf(day)) });
    return {
      name: "Walk",
      kind: "yesNo",
      question: "Did you walk for half an hour?",
      frequency: { times: 3, days: 7 },
      color: "#3f9c4f",
      checks: done.map((day) => ({ date: dateOf(day) })),
    };
  },
  "water-the-plants.json": () => {
    const { done } = walk({ seed: 4, keep: 0.95, restart: 0.9, wanted: (day) => (day - first) % 3 === 0 });
    return {
      name: "Water the plants",
      kind: "yesNo",
      frequency: { times: 1, days: 3 },
      color: "#2a9d8f",
      checks: done.map((day) => ({ date: dateOf(day) })),
    };
  },
  "coffee.json": () => {
    const { done, next } = walk({ seed: 5, keep: 0.97, restart: 0.97 });
    return {
      name: "Coffee",
      kind: "number",
      question: "How many cups of coffee did you drink?",
      unit: "cups",
      target: { value: 2, type: "atMost" },
      frequency: { times: 1, days: 1 },
      color: "#e07b26",
      checks: done.map((day) => ({ date: dateOf(day), value: [0, 1, 1, 2, 2, 2, 3, 4][Math.floor(next() * 8)] })),
    };
  },
  "practise-guitar.json": () => {
    const { done } = walk({ seed: 6, keep: 0.3, restart: 0.2 });
    return {
      name: "Practise guitar",
      kind: "yesNo",
      frequency: { times: 4, days: 30 },
      color: "#d0558f",
      checks: done.map((day) => ({ date: dateOf(day) })),
    };
  },
  "journal.json": () => {
    // Stopped in the spring of 2026, and archived: the history stays.
    const { done } = walk({ seed: 7, end: dayOf("2026-04-30"), keep: 0.8, restart: 0.4 });
    return {
      name: "Journal",
      kind: "yesNo",
      frequency: { times: 1, days: 1 },
      color: "#c9a227",
      archived: true,
      checks: done.map((day) => ({ date: dateOf(day) })),
    };
  },
};

for (const [file, build] of Object.entries(habits)) {
  // Prettier keeps an object on one line when it was on one line, so each check stays one short line.
  const text = JSON.stringify(build(), null, 2).replace(
    /\{\n\s+("date": "[^"]+")(,\n\s+"(?:value|note)": [^\n]+)*\n\s+\}/g,
    (match) => `{ ${match.slice(1, -1).trim().replace(/\n\s+/g, " ")} }`,
  );
  await writeFile(`${folder}${file}`, await format(text, { ...options, parser: "json" }));
}
const index = JSON.stringify(Object.keys(habits).sort());
await writeFile(`${folder}index.json`, await format(index, { ...options, parser: "json" }));
process.stdout.write(`Wrote ${String(Object.keys(habits).length)} mock habits to data/habits/.\n`);
