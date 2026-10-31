// The habits widget. It talks to its host only through fetch to relative paths. Inside Eva, Eva
// answers them with the person's data. On GitHub Pages, the mock files of this repository answer.
// See the contract: https://github.com/guplem/eva/blob/main/docs/widgets.md
//
// habits.js computes the numbers of a habit. This file reads and writes the files, and draws.
import {
  bestStreaks,
  checksOf,
  currentStreak,
  dateOf,
  dayOf,
  frequencyText,
  habitFacts,
  isNumberHabit,
  localToday,
} from "./habits.js";

const sizes = ["small", "medium", "large", "full"];
const habitFile = /^[a-z0-9-]+\.json$/;
const pastDays = 6;
const demoNote = "This is a demo: the change shows on this screen only.";
const refusedNote = "Eva could not save this change. Try again.";
const svgSpace = "http://www.w3.org/2000/svg";

const root = document.querySelector(".widget");
const titleElement = root.querySelector(".widget-title");
const summaryElement = root.querySelector('[data-role="summary"]');
const listElement = root.querySelector('[data-role="habits"]');
const detailElement = root.querySelector('[data-role="detail"]');
const todayElement = root.querySelector('[data-role="today"]');
const noteElement = root.querySelector('[data-role="note"]');
const dialog = root.querySelector('[data-role="value-dialog"]');

/** @type {{ file: string, habit: Record<string, unknown> }[]} */
let entries = [];
/** The file of the habit that full screen shows. */
let selected = null;
/** The date that the screen shows as today, so the widget draws again after midnight. */
let shownToday = "";

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** The JSON at a path, or undefined when the path does not answer. */
async function readJson(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

function habitPath(file) {
  return `data/habits/${encodeURIComponent(file)}`;
}

function isHabit(value) {
  return typeof value === "object" && value !== null && typeof value.name === "string";
}

async function loadHabits() {
  const names = await readJson("data/habits/index.json");
  if (!Array.isArray(names)) return [];
  const files = names
    .filter((name) => typeof name === "string" && habitFile.test(name) && name !== "index.json")
    .sort();
  const habits = await Promise.all(files.map(async (file) => ({ file, habit: await readJson(habitPath(file)) })));
  // Another widget or the person can write a file with fewer fields: show what can be shown.
  return habits.filter(({ habit }) => isHabit(habit));
}

function entryOf(file) {
  return entries.find((entry) => entry.file === file);
}

function todayNumber() {
  return dayOf(localToday());
}

/** The numbers of a habit, once for each version of the habit and each day. */
const factsCache = new WeakMap();
function facts(habit, today) {
  const cached = factsCache.get(habit);
  if (cached?.today === today) return cached.facts;
  const computed = habitFacts(habit, today);
  factsCache.set(habit, { today, facts: computed });
  return computed;
}

// --- Drawing --------------------------------------------------------------------------------------

/** An element with a class and, as needed, a text. */
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attributes) {
  const node = document.createElementNS(svgSpace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

/** A ring that fills with the strength, from 0 to 1. */
function strengthRing(value, className = "strength-ring") {
  const percent = Math.round(value * 100);
  const radius = 15.9155;
  const ring = svg("svg", { viewBox: "0 0 36 36", class: className, role: "img" });
  ring.setAttribute("aria-label", `Strength ${String(percent)}%`);
  ring.append(
    svg("circle", { cx: 18, cy: 18, r: radius, class: "ring-track" }),
    // The circle is 100 long, so the dash length is the percent.
    svg("circle", {
      cx: 18,
      cy: 18,
      r: radius,
      class: "ring-fill",
      "stroke-dasharray": `${String(percent)} 100`,
      transform: "rotate(-90 18 18)",
    }),
  );
  return ring;
}

/** A tick, drawn here, for a done day. */
function tick() {
  const mark = svg("svg", { viewBox: "0 0 24 24", class: "tick", "aria-hidden": "true" });
  mark.append(svg("path", { d: "M5 12.5l4.5 4.5L19 7.5" }));
  return mark;
}

function amount(habit, value) {
  return `${numberFormat.format(value)} ${String(habit.unit ?? "")}`.trim();
}

/** The text of a day for a habit: its date, and whether it is done, with the value. */
function dayTitle(habit, day, value, covered) {
  const date = dateFormat.format(new Date(dateOf(day)));
  if (value === undefined) return covered ? `${date}: on track` : `${date}: not done`;
  return isNumberHabit(habit) ? `${date}: ${amount(habit, value)}` : `${date}: done`;
}

/** The mark of one day in the row of a habit: a tick, a value, or a dot. */
function fillMark(node, habit, value) {
  node.replaceChildren();
  if (value === undefined) node.append(element("span", "dot"));
  else if (isNumberHabit(habit)) node.append(element("span", "value", numberFormat.format(value)));
  else node.append(tick());
}

function habitRow(entry, today) {
  const { file, habit } = entry;
  const { done, covered, strength } = facts(habit, today);
  const item = element("li", "habit");
  item.dataset.file = file;

  const isFull = root.dataset.size === "full";
  const head = element(isFull ? "button" : "div", "habit-head");
  if (isFull) {
    head.type = "button";
    head.setAttribute("aria-current", String(file === selected));
    head.setAttribute("aria-label", habit.name);
    head.addEventListener("click", () => {
      selected = file;
      render();
    });
  }
  const label = element("span", "habit-label");
  label.append(element("span", "habit-name", habit.name), element("span", "habit-frequency", frequencyText(habit)));
  head.append(strengthRing(strength), label);

  const days = element("ol", "habit-days");
  days.setAttribute("aria-hidden", "true");
  for (let day = today - pastDays; day < today; day += 1) {
    const cell = element("li", "habit-day");
    const value = done.get(day);
    cell.classList.toggle("is-done", value !== undefined);
    cell.classList.toggle("is-covered", value === undefined && covered.has(day));
    cell.title = dayTitle(habit, day, value, covered.has(day));
    const mark = element("span", "day-mark");
    fillMark(mark, habit, value);
    cell.append(element("span", "day-name", dayFormat.format(new Date(dateOf(day)))), mark);
    days.append(cell);
  }

  const check = element("button", "habit-check");
  check.type = "button";
  const todayValue = done.get(today);
  check.setAttribute("aria-pressed", String(todayValue !== undefined));
  check.setAttribute("aria-label", `${habit.name}, today`);
  check.title = dayTitle(habit, today, todayValue, covered.has(today));
  fillMark(check, habit, todayValue);
  check.addEventListener("click", () => (isNumberHabit(habit) ? askValue(file) : toggle(file)));

  item.append(head, days, check);
  return item;
}

function render() {
  shownToday = localToday();
  const today = dayOf(shownToday);
  const done = entries.filter(({ habit }) => facts(habit, today).done.has(today)).length;
  summaryElement.textContent =
    entries.length === 0 ? "No habits yet." : `${String(done)} of ${String(entries.length)} done today`;
  if (entries.length === 0) {
    const empty = element("li", "habit-empty", "Ask Eva to track a habit, such as: “I want to read every day.”");
    listElement.replaceChildren(empty);
  } else {
    listElement.replaceChildren(...entries.map((entry) => habitRow(entry, today)));
  }
  // The small card: a ring of the habits done today, with the count inside.
  const ring = strengthRing(entries.length === 0 ? 0 : done / entries.length, "today-ring");
  ring.removeAttribute("aria-label");
  todayElement.replaceChildren(ring, element("span", "today-count", `${String(done)}/${String(entries.length)}`));
  renderDetail(today);
}

// --- Full screen: the details of one habit -------------------------------------------------------

function renderDetail(today) {
  const entry = entryOf(selected) ?? entries[0];
  detailElement.hidden = root.dataset.size !== "full" || entry === undefined;
  if (detailElement.hidden) return;
  selected = entry.file;
  const { habit } = entry;
  const numbers = facts(habit, today);
  const header = element("header", "detail-header");
  const label = element("div", "detail-label");
  label.append(element("h2", "detail-name", habit.name), element("p", "detail-frequency", frequencyText(habit)));
  header.append(strengthRing(numbers.strength, "strength-ring detail-ring"), label);
  detailElement.replaceChildren(
    header,
    stats(habit, numbers, today),
    element("h3", "detail-heading", "History"),
    calendar(habit, numbers, today),
    element("h3", "detail-heading", "Best streaks"),
    streakList(numbers),
  );
}

function days(count) {
  return count === 1 ? "1 day" : `${String(count)} days`;
}

function stats(habit, numbers, today) {
  const best = bestStreaks(numbers, 1)[0]?.length ?? 0;
  const total = isNumberHabit(habit) ? amount(habit, numbers.total.sum) : days(numbers.total.days);
  const list = element("dl", "stats");
  const rows = [
    ["strength", "Strength", `${String(Math.round(numbers.strength * 100))}%`],
    ["current", "Current streak", days(currentStreak(numbers, today))],
    ["best", "Best streak", days(best)],
    ["total", "Total", total],
  ];
  for (const [id, name, value] of rows) {
    const stat = element("div", "stat");
    stat.dataset.stat = id;
    stat.append(element("dt", "stat-name", name), element("dd", "stat-value", value));
    list.append(stat);
  }
  return list;
}

/**
 * The history: one column for each week, Monday first, and the newest week on the right. The
 * calendar shows as many weeks as fit its width, up to a year.
 */
function calendar(habit, { done, covered }, today) {
  const box = element("div", "calendar");
  const width = detailElement.clientWidth || root.clientWidth;
  const weeks = Math.max(8, Math.min(53, Math.floor(width / 22)));
  // Day 0, 1970-01-01, was a Thursday: (day + 3) % 7 is 0 on a Monday.
  const monday = today - ((today + 3) % 7);
  const first = monday - (weeks - 1) * 7;
  const grid = element("div", "calendar-grid");
  grid.setAttribute("role", "img");
  grid.setAttribute("aria-label", `The last ${String(weeks)} weeks of ${String(habit.name)}`);
  for (let week = 0; week < weeks; week += 1) {
    const start = first + week * 7;
    const month = element("span", "calendar-month");
    const startDate = new Date(dateOf(start));
    // A month label on the week where the month begins.
    if (week === 0 || startDate.getUTCDate() <= 7) month.textContent = monthFormat.format(startDate);
    grid.append(month);
    for (let day = start; day < start + 7; day += 1) {
      const cell = element("span", "calendar-day");
      const value = done.get(day);
      cell.classList.toggle("is-done", value !== undefined);
      cell.classList.toggle("is-covered", value === undefined && covered.has(day));
      cell.classList.toggle("is-future", day > today);
      if (day <= today) cell.title = dayTitle(habit, day, value, covered.has(day));
      grid.append(cell);
    }
  }
  box.append(grid);
  return box;
}

function streakList(numbers) {
  const best = bestStreaks(numbers, 5);
  const list = element("ol", "streak-list");
  if (best.length === 0) {
    list.append(element("li", "streak-empty", "No streak yet."));
    return list;
  }
  const longest = best[0].length;
  for (const run of best) {
    const item = element("li", "streak");
    const range = `${dateFormat.format(new Date(dateOf(run.start)))} – ${dateFormat.format(new Date(dateOf(run.end)))}`;
    const bar = svg("svg", { class: "streak-bar", viewBox: "0 0 100 10", preserveAspectRatio: "none" });
    bar.setAttribute("aria-hidden", "true");
    bar.append(svg("rect", { x: 0, y: 0, height: 10, rx: 2, width: Math.max(2, (run.length / longest) * 100) }));
    item.append(element("span", "streak-range", range), bar, element("span", "streak-length", days(run.length)));
    list.append(item);
  }
  return list;
}

// --- Changes ---------------------------------------------------------------------------------------

/** The writes, one at a time, so two quick presses reach the file in their order. */
let queue = Promise.resolve();
let writing = 0;
let reloadWanted = false;

/**
 * Applies `change` to a habit: on the screen at once, then to the newest file on disk. Eva or the
 * person can change the file between two reads, and the widget must not undo that. The widget
 * writes the whole file back, with every field that it had.
 */
function save(file, change) {
  const entry = entryOf(file);
  if (entry === undefined) return;
  entry.habit = change(entry.habit);
  render();
  writing += 1;
  queue = queue.then(async () => {
    let outcome;
    let written;
    try {
      const fresh = await readJson(habitPath(file));
      written = change(isHabit(fresh) ? fresh : entry.habit);
      const response = await fetch(habitPath(file), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: `${JSON.stringify(written, null, 2)}\n`,
      });
      // A static server, such as GitHub Pages, has no writes: the change stays on the screen only.
      outcome = response.ok ? "saved" : response.status === 404 || response.status === 405 ? "demo" : "refused";
    } catch {
      outcome = "refused";
    }
    writing -= 1;
    if (outcome === "saved") {
      noteElement.hidden = true;
      const current = entryOf(file);
      // A later press waits in the queue: its change is on the screen already.
      if (current !== undefined && writing === 0) current.habit = written;
    } else {
      showNote(outcome === "demo" ? demoNote : refusedNote);
      // Show the file as it is on disk, such as after Eva refused it with 422.
      if (outcome === "refused") reloadWanted = true;
    }
    if (writing === 0 && reloadWanted) await reload();
  });
}

function showNote(text) {
  noteElement.textContent = text;
  noteElement.hidden = false;
}

/** Adds or removes today's check of a yes or no habit. */
function toggle(file) {
  const date = localToday();
  const isDone = facts(entryOf(file).habit, dayOf(date)).done.has(dayOf(date));
  save(file, (habit) => {
    const checks = checksOf(habit);
    return {
      ...habit,
      checks: isDone ? checks.filter((check) => check?.date !== date) : [...checks, { date }],
    };
  });
}

/**
 * Today's value of a number habit becomes `value`, in one check. The first check of today keeps
 * its other fields, such as a note. `null` removes today's checks.
 */
function withValue(habit, date, value) {
  const checks = checksOf(habit);
  const first = checks.find((check) => check?.date === date);
  const others = checks.filter((check) => check?.date !== date);
  if (value === null) return { ...habit, checks: others };
  return { ...habit, checks: [...others, { ...(first ?? { date }), value }] };
}

/** Asks for today's value of a number habit, then saves it, removes it, or does nothing. */
function askValue(file) {
  const { habit } = entryOf(file);
  const date = localToday();
  const current = facts(habit, dayOf(date)).done.get(dayOf(date));
  const input = dialog.querySelector('input[name="value"]');
  dialog.querySelector('[data-role="value-title"]').textContent = `${String(habit.name)}, today`;
  dialog.querySelector('[data-role="value-unit"]').textContent = String(habit.unit ?? "");
  dialog.querySelector('[data-role="value-remove"]').hidden = current === undefined;
  input.value = current === undefined ? "" : String(current);
  dialog.returnValue = "cancel";
  dialog.onclose = () => {
    const value = Number(input.value);
    if (dialog.returnValue === "remove") save(file, (latest) => withValue(latest, date, null));
    else if (dialog.returnValue === "save" && input.value !== "" && Number.isFinite(value) && value >= 0)
      save(file, (latest) => withValue(latest, date, value));
  };
  dialog.showModal();
  input.focus();
}

// --- Start -----------------------------------------------------------------------------------------

async function reload() {
  // A write on its way wins: the folder is read again once the last write ends.
  if (writing > 0) {
    reloadWanted = true;
    return;
  }
  reloadWanted = false;
  const loaded = await loadHabits();
  if (writing > 0) {
    reloadWanted = true;
    return;
  }
  entries = loaded;
  render();
}

async function start() {
  const size = new URLSearchParams(window.location.search).get("size");
  // Opened alone in a browser, the widget shows its full-screen view.
  root.dataset.size = sizes.includes(size) ? size : "full";
  const config = (await readJson("config.json")) ?? {};
  if (typeof config.title === "string" && config.title.trim() !== "") titleElement.textContent = config.title;
  entries = await loadHabits();
  render();
  // Eva can write a check in a chat while the home page is away: read the folder again when it shows.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void reload();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void reload();
  });
  // A page that stays open overnight moves to the new day.
  setInterval(() => {
    if (localToday() !== shownToday) render();
  }, 60_000);
  // The calendar shows as many weeks as fit its width.
  let lastWidth = root.clientWidth;
  new ResizeObserver(() => {
    if (root.clientWidth === lastWidth) return;
    lastWidth = root.clientWidth;
    renderDetail(todayNumber());
  }).observe(root);
  for (const button of dialog.querySelectorAll("[data-close]")) {
    button.addEventListener("click", () => dialog.close(button.dataset.close));
  }
  dialog.querySelector('input[name="value"]').addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // Without this, the Enter key also presses the habit's button, which gets the focus back.
    event.preventDefault();
    dialog.close("save");
  });
  // Tests wait for this flag: every part of the widget has its content now.
  root.dataset.ready = "true";
}

void start();
