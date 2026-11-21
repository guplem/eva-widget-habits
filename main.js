// The habits widget. It talks to its host only through fetch to relative paths. Inside Eva, Eva
// answers them with the person's data. On GitHub Pages, the mock files of this repository answer.
// See the contract: https://github.com/guplem/eva/blob/main/docs/widgets.md
//
// habits.js computes the numbers of a habit. This file reads and writes the files, and draws.
import {
  bestStreaks,
  colorIndex,
  completionRate,
  currentStreak,
  dateOf,
  dayOf,
  frequencyChoice,
  frequencyFromChoice,
  frequencyText,
  habitColorNames,
  habitColors,
  habitFacts,
  isArchived,
  isNumberHabit,
  localToday,
  periodTotals,
  ratePeriods,
  sortEntries,
  sortOrders,
  targetOf,
  targetText,
  weekdayOf,
  weekdayTotals,
  withDay,
  withSkip,
} from "./habits.js";

const sizes = ["small", "medium", "tall", "large", "xlarge", "full"];
/** The sizes that show the overview of every habit, with its last days and its details. */
const overviewSizes = new Set(["large", "xlarge", "full"]);
const habitFile = /^[a-z0-9-]+\.json$/;
const pastDays = 6;
const demoNote = "This is a demo: the change shows on this screen only.";
const refusedNote = "Eva could not save this change. Try again.";
const svgSpace = "http://www.w3.org/2000/svg";
/** Eva keeps this top right corner free for her buttons: the menu never covers it. */
const cornerPx = 56;

const root = document.querySelector(".widget");
const titleElement = root.querySelector(".widget-title");
const summaryElement = root.querySelector('[data-role="summary"]');
const listElement = root.querySelector('[data-role="habits"]');
const toolbarElement = root.querySelector('[data-role="toolbar"]');
const sortElement = root.querySelector('[data-role="sort"]');
const archivedElement = root.querySelector('[data-role="show-archived"]');
const dayHeaderElement = root.querySelector('[data-role="day-header"]');
const detailElement = root.querySelector('[data-role="detail"]');
const chipList = root.querySelector('[data-role="chips"]');
const noteElement = root.querySelector('[data-role="note"]');
const menuElement = root.querySelector('[data-role="menu"]');
const dialog = root.querySelector('[data-role="value-dialog"]');

/** @type {{ file: string, habit: Record<string, unknown> }[]} */
let entries = [];
/** The file of the habit that the details show. */
let selected = null;
/** On a narrow screen, the details take the place of the list until the person goes back. */
let detailOpen = false;
/** The bar chart of the details counts by week or by month. */
let barUnit = "week";
/** The date that the screen shows as today, so the widget draws again after midnight. */
let shownToday = "";
/** The widget's own state in Eva (`eva/state.json`): the sort order and the archived habits. */
const state = { sort: "name", showArchived: false };
/** The whole object of eva/state.json, so a save keeps the keys of a newer version. */
let storedState = {};

// The texts of the widget are English, so its dates and numbers are too.
const dayFormat = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const longDateFormat = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const weekdayLetters = ["M", "T", "W", "T", "F", "S", "S"];
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

function isOverview() {
  return overviewSizes.has(root.dataset.size);
}

/** A wide and tall frame shows the list and the details side by side. */
function hasTwoPanes() {
  return isOverview() && root.clientWidth >= 760 && root.clientHeight >= 420;
}

/** The habits that the list shows, in the person's order. An archived habit shows only on request. */
function shownEntries(today) {
  const shown = entries.filter(({ habit }) => !isArchived(habit) || (isOverview() && state.showArchived));
  return sortEntries(shown, state.sort, today);
}

// --- Drawing --------------------------------------------------------------------------------------

/** An element with a class and, as needed, a text. */
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text) {
  const node = element("button", className, text);
  node.type = "button";
  return node;
}

function svg(tag, attributes) {
  const node = document.createElementNS(svgSpace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

/** The class of a habit's colour, such as `color-3`, or `color-none` for the accent colour. */
function colorClass(habit) {
  const index = colorIndex(habit);
  return index === null ? "color-none" : `color-${String(index)}`;
}

/** A ring that fills with the strength, from 0 to 1. */
function strengthRing(value, className = "strength-ring", withText = false) {
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
  if (withText) {
    const text = svg("text", {
      x: 18,
      y: 18,
      class: "ring-text",
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    text.textContent = String(percent);
    ring.append(text);
  }
  return ring;
}

/** A tick, drawn here, for a done day. */
function tick() {
  const mark = svg("svg", { viewBox: "0 0 24 24", class: "tick", "aria-hidden": "true" });
  mark.append(svg("path", { d: "M5 12.5l4.5 4.5L19 7.5" }));
  return mark;
}

/** A dash, drawn here, for a skipped day. */
function dash() {
  const mark = svg("svg", { viewBox: "0 0 24 24", class: "tick", "aria-hidden": "true" });
  mark.append(svg("path", { d: "M7 12h10" }));
  return mark;
}

function amount(habit, value) {
  return `${numberFormat.format(value)} ${String(habit.unit ?? "")}`.trim();
}

function dayName(day, today) {
  if (day === today) return "today";
  if (day === today - 1) return "yesterday";
  return longDateFormat.format(new Date(dateOf(day)));
}

/** The state of a day for a habit in words: done, with the value, skipped, on track or not done. */
function dayState(habit, day, numbers) {
  const value = numbers.checked.get(day);
  if (numbers.done.has(day)) return isNumberHabit(habit) ? amount(habit, value) : "done";
  if (numbers.skipped.has(day)) return "skipped";
  if (value !== undefined) return `${amount(habit, value)}, not done`;
  return numbers.covered.has(day) ? "on track" : "not done";
}

/** The text of a day for a habit: its date and its state. */
function dayTitle(habit, day, numbers) {
  return `${dateFormat.format(new Date(dateOf(day)))}: ${dayState(habit, day, numbers)}`;
}

/** The mark of one day: a tick, a value, a dash for a skip, or a dot. */
function fillMark(node, habit, day, numbers) {
  node.replaceChildren();
  const value = numbers.checked.get(day);
  if (numbers.skipped.has(day)) node.append(dash());
  else if (isNumberHabit(habit) && value !== undefined)
    node.append(element("span", "value", numberFormat.format(value)));
  else if (numbers.done.has(day)) node.append(tick());
  else node.append(element("span", "dot"));
}

/** The class names of a day's state, for a cell of the list or of the calendar. */
function markState(node, day, numbers, today) {
  node.classList.toggle("is-done", numbers.done.has(day));
  node.classList.toggle("is-skipped", numbers.skipped.has(day));
  node.classList.toggle("is-partial", !numbers.done.has(day) && numbers.checked.has(day));
  node.classList.toggle("is-covered", !numbers.done.has(day) && !numbers.skipped.has(day) && numbers.covered.has(day));
  node.classList.toggle("is-future", day > today);
}

/** The button of today, or of a past day in the overview: a tap marks the day, or asks the value. */
function dayButton(entry, day, today, className) {
  const { file, habit } = entry;
  const numbers = facts(habit, today);
  const node = button(className);
  const isDone = numbers.done.has(day);
  node.setAttribute("aria-pressed", String(isDone));
  node.setAttribute("aria-label", `${String(habit.name)}, ${dayName(day, today)}`);
  node.title = dayTitle(habit, day, numbers);
  node.dataset.date = dateOf(day);
  node.dataset.focusKey = `${file}|${dateOf(day)}|${className}`;
  markState(node, day, numbers, today);
  fillMark(node, habit, day, numbers);
  node.addEventListener("click", () => (isNumberHabit(habit) ? askValue(file, day) : toggle(file, day)));
  // A long press or a right click offers the other states of the day, such as a skip.
  onHold(node, (point) => openDayMenu(file, day, point, node));
  return node;
}

/** The row of a habit in a medium or tall card: its strength, its last days and today. */
function habitRow(entry, today) {
  const { file, habit } = entry;
  const numbers = facts(habit, today);
  const item = element("li", `habit ${colorClass(habit)}`);
  item.dataset.file = file;
  const head = element("div", "habit-head");
  const label = element("span", "habit-label");
  label.append(element("span", "habit-name", habit.name), element("span", "habit-frequency", frequencyText(habit)));
  head.append(strengthRing(numbers.strength), label);
  // A long press or a right click on the name opens the menu of the habit.
  onHold(head, (point) => openHabitMenu(file, point, more));
  const more = moreButton(file, habit);

  const days = element("ol", "habit-days");
  days.setAttribute("aria-hidden", "true");
  for (let day = today - pastDays; day < today; day += 1) {
    const cell = element("li", "habit-day");
    markState(cell, day, numbers, today);
    cell.title = dayTitle(habit, day, numbers);
    const mark = element("span", "day-mark");
    fillMark(mark, habit, day, numbers);
    cell.append(element("span", "day-name", dayFormat.format(new Date(dateOf(day)))), mark);
    days.append(cell);
  }
  item.append(head, days, dayButton(entry, today, today, "habit-check"), more);
  return item;
}

/** How many day cells, today included, fit a row of the overview. */
function overviewCells() {
  const width = listElement.clientWidth || root.clientWidth;
  const em = parseFloat(getComputedStyle(listElement).fontSize) || 16;
  // The name keeps about 12em, and each day takes 2.2em with its gap.
  return Math.max(2, Math.min(28, Math.floor((width - 14 * em) / (2.3 * em))));
}

/** The row of a habit in the overview: its strength, its name and streak, and one cell for each last day. */
function overviewRow(entry, today, cells) {
  const { file, habit } = entry;
  const numbers = facts(habit, today);
  const item = element("li", `habit habit-wide ${colorClass(habit)}`);
  item.classList.toggle("is-archived", isArchived(habit));
  item.dataset.file = file;
  const head = button("habit-head");
  head.dataset.focusKey = `${file}|head`;
  head.setAttribute("aria-current", String(hasTwoPanes() && file === selected));
  head.setAttribute("aria-label", `${String(habit.name)}, details`);
  head.addEventListener("click", () => openDetail(file));
  const more = moreButton(file, habit);
  onHold(head, (point) => openHabitMenu(file, point, more));
  const label = element("span", "habit-label");
  const streak = currentStreak(numbers, today);
  const meta = [frequencyText(habit)];
  if (isArchived(habit)) meta.push("archived");
  else if (streak > 0) meta.push(`${String(streak)}-day streak`);
  label.append(element("span", "habit-name", habit.name), element("span", "habit-frequency", meta.join(" · ")));
  head.append(strengthRing(numbers.strength, "strength-ring", true), label);
  const row = element("ol", "habit-cells");
  for (let day = today - cells + 1; day < today; day += 1) {
    const cell = element("li", "habit-cell");
    cell.append(dayButton(entry, day, today, "day-cell"));
    row.append(cell);
  }
  item.append(head, row, dayButton(entry, today, today, "habit-check"), more);
  return item;
}

/** The names of the days above the cells of the overview. */
function renderDayHeader(today, cells, show) {
  dayHeaderElement.hidden = !show;
  if (!show) return;
  const spacer = element("span", "day-header-space");
  const labels = [];
  for (let day = today - cells + 1; day <= today; day += 1) {
    const date = new Date(dateOf(day));
    const label = element("span", day === today ? "day-header-day is-today" : "day-header-day");
    label.append(
      element("span", "day-header-name", dayFormat.format(date)),
      element("span", "", String(date.getUTCDate())),
    );
    labels.push(label);
  }
  dayHeaderElement.replaceChildren(spacer, ...labels);
}

function render() {
  // A redraw replaces the buttons: the focus goes to the new button of the same place.
  const focused = document.activeElement;
  const focusKey = focused instanceof HTMLElement && root.contains(focused) ? focused.dataset.focusKey : undefined;
  shownToday = localToday();
  const today = dayOf(shownToday);
  const active = entries.filter(({ habit }) => !isArchived(habit));
  const done = active.filter(({ habit }) => facts(habit, today).done.has(today)).length;
  const skipped = active.filter(({ habit }) => facts(habit, today).skipped.has(today)).length;
  let summary = `${String(done)} of ${String(active.length)} done today`;
  if (skipped > 0) summary += ` · ${String(skipped)} skipped`;
  summaryElement.textContent = active.length === 0 ? "No habits yet." : summary;
  const shown = shownEntries(today);
  const overview = isOverview();
  root.classList.toggle("is-overview", overview);
  // A short frame, such as a large card on a computer, keeps its height for the habits.
  const short = overview && root.clientHeight < 300;
  root.classList.toggle("is-short", short);
  toolbarElement.hidden = !overview || short || entries.length === 0;
  // The view comes first: the list measures its width for the day cells.
  const detailEntry = chooseView(shown);
  const cells = overview ? overviewCells() : 0;
  renderDayHeader(today, cells, overview && !short && shown.length > 0);
  if (shown.length === 0) {
    const empty = element("li", "habit-empty", "Ask Eva to track a habit, such as: “I want to read every day.”");
    listElement.replaceChildren(empty);
  } else {
    listElement.replaceChildren(
      ...shown.map((entry) => (overview ? overviewRow(entry, today, cells) : habitRow(entry, today))),
    );
  }
  renderChips(today);
  if (detailEntry !== null) renderDetail(detailEntry, today);
  restoreFocus(focusKey);
}

/** Gives the focus to the new element of the place that had it before a redraw. */
function restoreFocus(key) {
  if (key === undefined || (document.activeElement !== document.body && document.activeElement !== null)) return;
  const next = root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (!(next instanceof HTMLElement)) return;
  if (next.getAttribute("role") === "gridcell") {
    for (const cell of next.parentElement.querySelectorAll('[tabindex="0"]')) cell.tabIndex = -1;
    next.tabIndex = 0;
  }
  next.focus();
}

// --- Small: one chip for each habit --------------------------------------------------------------

function habitChip(entry, today) {
  const { file, habit } = entry;
  const numbers = facts(habit, today);
  const isDone = numbers.done.has(today);
  const chip = button("chip");
  chip.setAttribute("aria-pressed", String(isDone));
  chip.dataset.focusKey = `${file}|chip`;
  chip.setAttribute("aria-label", `${String(habit.name)}, today`);
  chip.title = dayTitle(habit, today, numbers);
  chip.classList.toggle("is-skipped", numbers.skipped.has(today));
  const mark = element("span", "chip-mark");
  // The tick, not only the colour, says that the habit is done.
  if (isDone) mark.append(tick());
  else if (numbers.skipped.has(today)) mark.append(dash());
  chip.append(mark, element("span", "chip-name", habit.name));
  chip.addEventListener("click", () => (isNumberHabit(habit) ? askValue(file, today) : toggle(file, today)));
  onHold(chip, (point) => openHabitMenu(file, point, chip));
  const item = element("li", `chip-item ${colorClass(habit)}`);
  item.append(chip);
  return item;
}

function renderChips(today) {
  if (root.dataset.size !== "small") {
    chipList.replaceChildren();
    return;
  }
  const shown = shownEntries(today);
  if (shown.length === 0) {
    chipList.replaceChildren(element("li", "chip-more", "Ask Eva to track a habit."));
    return;
  }
  const more = element("li", "chip-more");
  more.dataset.role = "more";
  chipList.replaceChildren(...shown.map((entry) => habitChip(entry, today)), more);
  fitChips();
}

/** The smallest height of a chip, as style.css gives it: a whole touch target for a finger. */
const chipHeight = 40;

/**
 * Spreads the chips over as many rows as the card has room for, so the rows fill its height.
 * Then hides the last chips until the rest fit with no clipping, and says how many are hidden.
 * Full screen shows every habit.
 */
function fitChips() {
  const items = [...chipList.querySelectorAll(".chip-item")];
  const more = chipList.querySelector('[data-role="more"]');
  if (more === null) return;
  const gap = parseFloat(getComputedStyle(chipList).rowGap) || 0;
  const rows = Math.max(1, Math.floor((chipList.clientHeight + gap) / (chipHeight + gap)));
  const overflows = () => chipList.scrollHeight > chipList.clientHeight;
  for (const item of items) item.hidden = false;
  more.hidden = true;
  // style.css sets the width of a chip for 1 to 3 chips in a row.
  chipList.dataset.perRow = String(Math.ceil(items.length / rows));
  if (!overflows()) return;
  // Each chip takes its own width, so as many as possible fit, with "+N more" after them.
  chipList.dataset.perRow = "any";
  if (!overflows()) return;
  more.hidden = false;
  let shown = items.length;
  do {
    shown -= 1;
    items[shown].hidden = true;
    more.textContent = `+${String(items.length - shown)} more`;
  } while (shown > 0 && overflows());
}

// --- The details of one habit --------------------------------------------------------------------

/** Shows the details of a habit: beside the list when there is room, or in its place. */
function openDetail(file, focus = "back") {
  selected = file;
  detailOpen = true;
  if (focus === "settings") settingsDraft = { file, open: true, dirty: false };
  render();
  const target =
    focus === "settings"
      ? detailElement.querySelector('[data-role="settings"] input[name="name"]')
      : detailElement.querySelector(hasTwoPanes() ? ".detail-name" : '[data-role="back"]');
  target?.focus();
}

function closeDetail() {
  const file = selected;
  detailOpen = false;
  render();
  listElement.querySelector(`[data-file="${CSS.escape(file ?? "")}"] .habit-head`)?.focus();
}

/** The settings form of the details, kept while the person types, so a redraw loses nothing. */
let settingsDraft = null;

/**
 * Shows the list, the details, or both side by side. Returns the habit of the details, or null
 * when they do not show.
 */
function chooseView(shown) {
  const two = hasTwoPanes();
  const entry = entryOf(selected) ?? shown[0];
  // The details show beside the overview when there is room. Any size but small shows them in
  // place of the list once the person opens them.
  const visible = entry !== undefined && ((isOverview() && two) || (detailOpen && root.dataset.size !== "small"));
  detailElement.hidden = !visible;
  root.dataset.view = !visible ? "list" : two ? "both" : "detail";
  if (!visible) return null;
  selected = entry.file;
  return entry;
}

function renderDetail(entry, today) {
  const two = hasTwoPanes();
  const { habit } = entry;
  const numbers = facts(habit, today);
  detailElement.className = `habit-detail ${colorClass(habit)}`;
  const parts = [detailHeader(entry, numbers, today, two)];
  parts.push(stats(habit, numbers, today), rates(habit, numbers, today));
  parts.push(element("h3", "detail-heading", "History"), calendar(entry, numbers, today));
  parts.push(barChart(habit, numbers, today));
  parts.push(element("h3", "detail-heading", "Best days"), weekdayChart(numbers, today));
  parts.push(element("h3", "detail-heading", "Best streaks"), streakList(numbers));
  if (typeof habit.note === "string" && habit.note.trim() !== "") {
    parts.push(element("h3", "detail-heading", "Note"), element("p", "detail-note", habit.note));
  }
  parts.push(settingsForm(entry));
  detailElement.replaceChildren(...parts);
}

function detailHeader(entry, numbers, today, two) {
  const { habit } = entry;
  const header = element("header", "detail-header");
  if (!two) {
    const back = button("button-plain detail-back", "‹ All habits");
    back.dataset.role = "back";
    back.dataset.focusKey = "back";
    back.addEventListener("click", closeDetail);
    header.append(back);
  }
  const title = element("div", "detail-title");
  const label = element("div", "detail-label");
  const name = element("h2", "detail-name", habit.name);
  name.tabIndex = -1;
  label.append(name);
  if (typeof habit.question === "string" && habit.question.trim() !== "") {
    label.append(element("p", "detail-question", habit.question));
  }
  const meta = [frequencyText(habit)];
  const target = targetText(habit);
  if (target !== "") meta.push(target);
  if (isArchived(habit)) meta.push("Archived");
  label.append(element("p", "detail-frequency", meta.join(" · ")));
  title.append(strengthRing(numbers.strength, "strength-ring detail-ring", true), label);
  const todayButton = dayButton(entry, today, today, "habit-check detail-check");
  header.append(title, todayButton, moreButton(entry.file, habit, "detail"));
  return header;
}

function days(count) {
  return count === 1 ? "1 day" : `${String(count)} days`;
}

function percent(value) {
  return value === null ? "–" : `${String(Math.round(value * 100))}%`;
}

function stats(habit, numbers, today) {
  const best = bestStreaks(numbers, 1)[0]?.length ?? 0;
  const total = isNumberHabit(habit) ? amount(habit, numbers.total.sum) : days(numbers.total.days);
  const list = element("dl", "stats");
  const rows = [
    ["strength", "Strength", percent(numbers.strength)],
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

/** The completion rate over the last week, month, year and all the time, each with a meter. */
function rates(habit, numbers, today) {
  const list = element("dl", "rates");
  list.setAttribute("aria-label", "Completion rate");
  for (const period of ratePeriods) {
    const value = completionRate(habit, numbers, today, period.days);
    const item = element("div", "rate");
    item.dataset.rate = period.id;
    item.title = period.days === null ? "Since the first check" : `The last ${String(period.days)} days`;
    const meter = element("span", "rate-meter");
    meter.setAttribute("aria-hidden", "true");
    const fill = element("span", "rate-fill");
    fill.style.setProperty("width", `${String(Math.round((value ?? 0) * 100))}%`);
    meter.append(fill);
    item.append(element("dt", "rate-name", period.name), element("dd", "rate-value", percent(value)), meter);
    list.append(item);
  }
  return list;
}

/**
 * The history: one column for each week, Monday first, and the newest week on the right. The
 * calendar shows as many weeks as fit its width, up to a year. A tap on a day changes it. The
 * calendar is one stop of the Tab key: the arrow keys move between its days.
 */
function calendar(entry, numbers, today) {
  const { file, habit } = entry;
  const box = element("div", "calendar");
  const width = detailElement.clientWidth || root.clientWidth;
  const weeks = Math.max(8, Math.min(53, Math.floor((width - 24) / 20)));
  const monday = today - weekdayOf(today);
  const first = monday - (weeks - 1) * 7;
  const grid = element("div", "calendar-grid");
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", `The last ${String(weeks)} weeks of ${String(habit.name)}. Use the arrow keys.`);
  const target = targetOf(habit);
  const largest = Math.max(1, ...numbers.checked.values());
  grid.append(element("span", "calendar-month"));
  for (let weekday = 0; weekday < 7; weekday += 1) {
    grid.append(element("span", "calendar-weekday", weekday % 2 === 0 ? weekdayLetters[weekday] : ""));
  }
  let labelWeek = -3;
  for (let week = 0; week < weeks; week += 1) {
    const start = first + week * 7;
    const month = element("span", "calendar-month");
    const startDate = new Date(dateOf(start + 6));
    // A month label on the week where the month begins, when it has room after the last label.
    if (startDate.getUTCDate() <= 7 && week - labelWeek >= 3) {
      month.textContent = monthFormat.format(startDate);
      labelWeek = week;
    }
    grid.append(month);
    for (let day = start; day < start + 7; day += 1) {
      if (day > today) {
        grid.append(element("span", "calendar-day is-future"));
        continue;
      }
      const cell = button("calendar-day");
      cell.setAttribute("role", "gridcell");
      cell.tabIndex = day === today ? 0 : -1;
      cell.dataset.day = String(day);
      cell.dataset.focusKey = `calendar|${String(day)}`;
      markState(cell, day, numbers, today);
      // A number habit shades each day by its part of the target, or of its largest value.
      const value = numbers.checked.get(day);
      if (isNumberHabit(habit) && value !== undefined && !numbers.done.has(day)) {
        const share = target?.type === "atLeast" ? value / target.value : value / largest;
        cell.classList.add(`level-${String(Math.max(1, Math.min(3, Math.ceil(share * 3))))}`);
      }
      cell.setAttribute(
        "aria-label",
        `${longDateFormat.format(new Date(dateOf(day)))}: ${dayState(habit, day, numbers)}`,
      );
      cell.title = dayTitle(habit, day, numbers);
      cell.addEventListener("click", () => openDayMenu(file, day, cell.getBoundingClientRect(), cell));
      grid.append(cell);
    }
  }
  grid.addEventListener("keydown", (event) => {
    const steps = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (!(event.key in steps) || !(event.target instanceof HTMLElement)) return;
    const day = Number(event.target.dataset.day) + steps[event.key];
    const next = grid.querySelector(`[data-day="${String(day)}"]`);
    if (next === null) return;
    event.preventDefault();
    event.target.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  });
  box.append(grid);
  const legend = element("p", "calendar-legend");
  for (const [className, text] of [
    ["is-done", "Done"],
    ["is-covered", "On track"],
    ["is-skipped", "Skipped"],
  ]) {
    const key = element("span", "legend-item");
    key.append(element("span", `calendar-day ${className}`), text);
    legend.append(key);
  }
  box.append(legend);
  return box;
}

/** A bar chart of the done days, or of the sum of a number habit, for each week or month. */
function barChart(habit, numbers, today) {
  const box = element("section", "bars-box");
  const head = element("div", "bars-head");
  head.append(
    element("h3", "detail-heading", isNumberHabit(habit) ? `Total ${String(habit.unit ?? "")}`.trim() : "Done days"),
  );
  const switcher = element("div", "segmented");
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Count by");
  for (const [unit, text] of [
    ["week", "Week"],
    ["month", "Month"],
  ]) {
    const option = button("segment", text);
    option.dataset.focusKey = `segment|${unit}`;
    option.setAttribute("aria-pressed", String(barUnit === unit));
    option.addEventListener("click", () => {
      barUnit = unit;
      render();
      detailElement.querySelector(`.segment[aria-pressed="true"]`)?.focus();
    });
    switcher.append(option);
  }
  head.append(switcher);
  const width = detailElement.clientWidth || root.clientWidth;
  const count = Math.max(6, Math.min(24, Math.floor(width / 40)));
  const periods = periodTotals(numbers, today, barUnit, count);
  const values = periods.map((period) => (isNumberHabit(habit) ? period.sum : period.done));
  const largest = Math.max(1, ...values);
  const chart = element("ol", "bars");
  chart.setAttribute("aria-label", `${isNumberHabit(habit) ? "Total" : "Done days"} by ${barUnit}`);
  periods.forEach((period, index) => {
    const start = new Date(dateOf(period.start));
    const name = barUnit === "week" ? dateFormat.format(start) : monthFormat.format(start);
    const bar = element("li", "bar");
    bar.title = `${barUnit === "week" ? `Week of ${name}` : name}: ${isNumberHabit(habit) ? amount(habit, values[index]) : days(values[index])}`;
    const track = element("span", "bar-track");
    const fill = element("span", "bar-fill");
    fill.style.setProperty("height", `${String((values[index] / largest) * 100)}%`);
    track.append(fill);
    // A label under every bar would crowd: one under every other bar, and the newest.
    const showName = (periods.length - 1 - index) % 2 === 0;
    bar.append(element("span", "bar-value", values[index] === 0 ? "" : numberFormat.format(values[index])), track);
    bar.append(element("span", "bar-name", showName ? name : ""));
    chart.append(bar);
  });
  box.append(head, chart);
  return box;
}

/** The done days of each day of the week, over the last year. */
function weekdayChart(numbers, today) {
  const counts = weekdayTotals(numbers, today);
  const largest = Math.max(1, ...counts);
  const chart = element("ol", "bars weekday-bars");
  chart.setAttribute("aria-label", "Done days by day of the week, the last year");
  counts.forEach((count, index) => {
    const bar = element("li", "bar");
    bar.title = `${weekdayNames[index]}: ${days(count)}`;
    const track = element("span", "bar-track");
    const fill = element("span", "bar-fill");
    fill.style.setProperty("height", `${String((count / largest) * 100)}%`);
    track.append(fill);
    bar.append(element("span", "bar-value", String(count)), track, element("span", "bar-name", weekdayLetters[index]));
    chart.append(bar);
  });
  return chart;
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

// --- The settings of a habit, in the details ------------------------------------------------------

function field(labelText, control, className = "field") {
  const label = element("label", className);
  label.append(element("span", "field-label", labelText), control);
  return label;
}

function input(name, value, type = "text") {
  const node = element("input");
  node.name = name;
  node.type = type;
  node.value = value === undefined || value === null ? "" : String(value);
  return node;
}

function select(name, options, value) {
  const node = element("select");
  node.name = name;
  for (const [optionValue, text] of options) {
    const option = element("option", undefined, text);
    option.value = optionValue;
    node.append(option);
  }
  node.value = value;
  return node;
}

/**
 * The settings of a habit, folded under "Edit habit": its name, question, frequency, target,
 * colour and note, and the archive. Save writes them into the file, with every other field.
 */
function settingsForm(entry) {
  if (settingsDraft?.file === entry.file && settingsDraft.dirty) return settingsDraft.node;
  const { file, habit } = entry;
  const box = element("details", "settings");
  box.dataset.role = "settings";
  if (settingsDraft?.file === file && settingsDraft.open) box.open = true;
  const summary = element("summary", "settings-summary", "Edit habit");
  box.append(summary);
  const name = input("name", habit.name);
  name.required = true;
  name.maxLength = 80;
  const question = input("question", habit.question);
  question.placeholder = "Did you … today?";
  const frequency = frequencyChoice(habit);
  const choice = select(
    "frequency",
    [
      ["daily", "Every day"],
      ["weekly", "Times a week"],
      ["monthly", "Times a month"],
      ["interval", "Every N days"],
      ["custom", "Times in N days"],
    ],
    frequency.choice,
  );
  const count = input("count", frequency.count, "number");
  count.min = "1";
  count.max = "365";
  const customDays = input("days", frequency.days ?? 7, "number");
  customDays.min = "1";
  customDays.max = "365";
  const countField = field("Times", count, "field field-small");
  const daysField = field("In days", customDays, "field field-small");
  const showCounts = () => {
    countField.hidden = choice.value === "daily";
    countField.querySelector(".field-label").textContent = choice.value === "interval" ? "Days" : "Times";
    daysField.hidden = choice.value !== "custom";
  };
  choice.addEventListener("change", showCounts);
  showCounts();
  const row = element("div", "field-row");
  row.append(field("Frequency", choice), countField, daysField);
  const parts = [field("Name", name), field("Question", question), row];
  const target = targetOf(habit);
  if (isNumberHabit(habit)) {
    const targetRow = element("div", "field-row");
    const targetType = select(
      "targetType",
      [
        ["none", "Any value"],
        ["atLeast", "At least"],
        ["atMost", "At most"],
      ],
      target?.type ?? "none",
    );
    const targetValue = input("targetValue", target?.value, "number");
    targetValue.min = "0";
    targetValue.step = "any";
    const unit = input("unit", habit.unit);
    unit.placeholder = "minutes";
    targetRow.append(
      field("Target", targetType),
      field("Value", targetValue, "field field-small"),
      field("Unit", unit),
    );
    parts.push(targetRow);
  }
  const colors = element("fieldset", "colors");
  colors.append(element("legend", "field-label", "Colour"));
  const current = colorIndex(habit);
  const swatches = [["none", "Default"], ...habitColors.map((hex, index) => [hex, habitColorNames[index]])];
  for (const [value, text] of swatches) {
    const swatch = element(
      "label",
      `swatch ${value === "none" ? "color-none" : `color-${String(habitColors.indexOf(value))}`}`,
    );
    const radio = input("color", value, "radio");
    radio.checked = value === "none" ? current === null : habitColors.indexOf(value) === current;
    radio.setAttribute("aria-label", text);
    swatch.title = text;
    swatch.append(radio);
    colors.append(swatch);
  }
  parts.push(colors);
  const note = element("textarea");
  note.name = "note";
  note.rows = 2;
  note.value = typeof habit.note === "string" ? habit.note : "";
  parts.push(field("Note", note));
  const actions = element("div", "settings-actions");
  const archive = button("button-plain", isArchived(habit) ? "Unarchive" : "Archive");
  archive.dataset.role = "archive";
  archive.addEventListener("click", () => {
    settingsDraft = { file, open: true, dirty: false };
    save(file, (latest) => withArchived(latest, !isArchived(latest)));
  });
  const reset = button("button-plain", "Reset");
  reset.addEventListener("click", () => {
    settingsDraft = { file, open: true, dirty: false };
    render();
  });
  const saveButton = button("button-main", "Save");
  saveButton.dataset.role = "save-settings";
  saveButton.addEventListener("click", () => {
    if (name.value.trim() === "") {
      name.focus();
      showNote("A habit needs a name.");
      return;
    }
    const values = readSettings(box, habit);
    settingsDraft = { file, open: true, dirty: false };
    save(file, (latest) => withSettings(latest, values));
  });
  actions.append(archive, element("span", "settings-gap"), reset, saveButton);
  parts.push(actions);
  const body = element("div", "settings-body");
  body.append(...parts);
  box.append(body);
  box.addEventListener("input", () => {
    settingsDraft = { file, open: true, dirty: true, node: box };
  });
  box.addEventListener("toggle", () => {
    if (settingsDraft?.dirty !== true) settingsDraft = { file, open: box.open, dirty: false };
  });
  return box;
}

/** The values of the settings form, as fields of a habit file. */
function readSettings(box, habit) {
  const value = (name) => box.querySelector(`[name="${name}"]`)?.value ?? "";
  const values = {
    name: value("name").trim(),
    question: value("question").trim(),
    frequency: frequencyFromChoice(value("frequency"), value("count"), value("days")),
    color: box.querySelector('[name="color"]:checked')?.value ?? "none",
    note: value("note").trim(),
  };
  if (isNumberHabit(habit)) {
    values.unit = value("unit").trim();
    const type = value("targetType");
    const amountValue = Number(value("targetValue"));
    values.target =
      type === "none" || value("targetValue") === "" || !Number.isFinite(amountValue) || amountValue < 0
        ? null
        : { value: amountValue, type };
  }
  return values;
}

/** The habit with the values of the settings form. An empty text removes its field. */
function withSettings(habit, values) {
  const next = { ...habit, name: values.name, frequency: { ...habit.frequency, ...values.frequency } };
  const optional = { question: values.question, note: values.note };
  if ("unit" in values) optional.unit = values.unit;
  for (const [key, text] of Object.entries(optional)) {
    if (text === "") delete next[key];
    else next[key] = text;
  }
  if (values.color === "none") delete next.color;
  else next.color = values.color;
  if ("target" in values) {
    if (values.target === null) delete next.target;
    else next.target = { ...(typeof habit.target === "object" ? habit.target : {}), ...values.target };
  }
  return next;
}

function withArchived(habit, archived) {
  const next = { ...habit };
  if (archived) next.archived = true;
  else delete next.archived;
  return next;
}

// --- The floating menu ----------------------------------------------------------------------------

/** The element that gets the focus back when the menu closes. */
let menuReturn = null;

/**
 * Opens the menu with these items, next to a point or a box. Each item has a `label` and an
 * `action`, and `checked` for a state such as "Done". The menu stays inside the frame and off
 * Eva's corner.
 */
function openMenu(items, anchor, label, returnFocus) {
  closeMenu(false);
  menuReturn = returnFocus ?? document.activeElement;
  menuElement.setAttribute("aria-label", label);
  menuElement.classList.toggle(
    "has-checks",
    items.some((item) => item.checked !== undefined),
  );
  // The title repeats the label for the eyes: a screen reader reads the label of the menu.
  const title = element("span", "menu-title", label);
  title.setAttribute("aria-hidden", "true");
  menuElement.replaceChildren(
    title,
    ...items.map((item) => {
      if (item.separator === true) {
        const line = element("div", "menu-separator");
        line.setAttribute("role", "separator");
        return line;
      }
      const entry = button("menu-item", item.label);
      entry.setAttribute("role", item.checked === undefined ? "menuitem" : "menuitemradio");
      if (item.checked !== undefined) entry.setAttribute("aria-checked", String(item.checked));
      entry.tabIndex = -1;
      if (item.role !== undefined) entry.dataset.role = item.role;
      entry.addEventListener("click", () => {
        closeMenu(true);
        item.action();
      });
      return entry;
    }),
  );
  menuElement.hidden = false;
  placeMenu(anchor);
  // A short frame needs each line for the entries: the title goes, as the label says the same.
  if (menuElement.scrollHeight > menuElement.clientHeight) {
    title.remove();
    placeMenu(anchor);
  }
  menuElement.querySelector(".menu-item")?.focus();
}

function closeMenu(restoreFocus = true) {
  if (menuElement.hidden) return;
  menuElement.hidden = true;
  menuElement.replaceChildren();
  const back = menuReturn;
  if (back instanceof HTMLElement && back.hasAttribute("aria-expanded")) back.setAttribute("aria-expanded", "false");
  menuReturn = null;
  if (restoreFocus && back instanceof HTMLElement && back.isConnected) back.focus();
}

/** Places the menu below the anchor, or above it, inside the frame and out of Eva's corner. */
function placeMenu(anchor) {
  const frame = { width: root.clientWidth, height: root.clientHeight };
  const margin = 6;
  const box = "width" in anchor ? anchor : { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y };
  menuElement.style.setProperty("max-height", `${String(frame.height - 2 * margin)}px`);
  const { width, height } = menuElement.getBoundingClientRect();
  let left = Math.min(box.left, frame.width - width - margin);
  let top = box.bottom + 4;
  if (top + height > frame.height - margin) top = box.top - height - 4;
  if (top < margin) top = Math.max(margin, frame.height - height - margin);
  left = Math.max(margin, left);
  // Eva's buttons sit in the top right corner: move down out of it, or left of it.
  if (left + width > frame.width - cornerPx && top < cornerPx) {
    if (cornerPx + height <= frame.height - margin) top = cornerPx;
    else if (frame.width - cornerPx - width - margin >= margin) left = frame.width - cornerPx - width - margin;
    else {
      // A card too small for the menu beside the corner, such as a small card of Eva's grid: the
      // menu goes under the corner, and scrolls.
      top = cornerPx;
      menuElement.style.setProperty("max-height", `${String(frame.height - cornerPx - margin)}px`);
    }
  }
  menuElement.style.setProperty("left", `${String(left)}px`);
  menuElement.style.setProperty("top", `${String(top)}px`);
}

function menuKeys(event) {
  const items = [...menuElement.querySelectorAll(".menu-item")];
  const index = items.indexOf(document.activeElement);
  const move = (to) => {
    event.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  };
  if (event.key === "ArrowDown") move(index + 1);
  else if (event.key === "ArrowUp") move(index - 1);
  else if (event.key === "Home") move(0);
  else if (event.key === "End") move(items.length - 1);
  else if (event.key === "Escape") {
    event.preventDefault();
    closeMenu(true);
  } else if (event.key === "Tab") closeMenu(false);
}

/**
 * Calls `open` with the point of a long press or a right click on `node`. After a long press,
 * the tap that ends it does nothing else.
 */
function onHold(node, open) {
  let timer = null;
  let start = null;
  let held = false;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  node.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    held = false;
    start = { x: event.clientX, y: event.clientY };
    cancel();
    timer = setTimeout(() => {
      held = true;
      open(start);
    }, 500);
  });
  node.addEventListener("pointermove", (event) => {
    if (start !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) node.addEventListener(type, cancel);
  node.addEventListener(
    "click",
    (event) => {
      if (!held) return;
      held = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  node.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    // A long press on a phone also sends this event: the menu is open already.
    if (held) return;
    open({ x: event.clientX, y: event.clientY });
  });
}

/** The menu of one day of a habit: done or its value, skipped, or not done. */
function openDayMenu(file, day, anchor, returnFocus) {
  const entry = entryOf(file);
  if (entry === undefined) return;
  const today = todayNumber();
  const numbers = facts(entry.habit, today);
  const date = dateOf(day);
  const isDone = numbers.done.has(day);
  const isSkipped = numbers.skipped.has(day);
  const hasCheck = numbers.checked.has(day);
  const items = [];
  if (isNumberHabit(entry.habit)) {
    items.push({ label: hasCheck ? "Change the value…" : "Enter the value…", action: () => askValue(file, day) });
  } else {
    items.push({
      label: "Done",
      checked: isDone,
      action: () => save(file, (habit) => withDay(habit, date, true)),
    });
  }
  items.push({
    label: "Skipped",
    checked: isSkipped,
    role: "skip",
    action: () => save(file, (habit) => withSkip(habit, date, !isSkipped)),
  });
  items.push({
    label: "Not done",
    checked: !isDone && !isSkipped && !hasCheck,
    action: () => save(file, (habit) => withSkip(withDay(habit, date, null), date, false)),
  });
  openMenu(items, anchor, `${String(entry.habit.name)}, ${dayName(day, today)}`, returnFocus);
}

// --- The menu of a habit, and Eva's help ---------------------------------------------------------

/** The folder of the habits in the vault, from config.json, such as `Life/Habits`. Empty when unknown. */
let folderPath = "";
/** What Eva lets the widget ask, from her answer to `hello`: `chat` and `open`. Empty outside Eva. */
let evaAsks = new Set();
let askCount = 0;
const waitingAsks = new Map();

window.addEventListener("message", (event) => {
  if (window.parent === window || event.source !== window.parent) return;
  const answer = event.data;
  if (typeof answer !== "object" || answer === null || answer.eva !== "widget" || typeof answer.ok !== "boolean")
    return;
  const resolve = waitingAsks.get(answer.id);
  if (resolve === undefined) return;
  waitingAsks.delete(answer.id);
  resolve(answer);
});

/**
 * Sends an ask to Eva, the parent page, and gives her answer: `{ ok: true }`, or `{ ok: false,
 * reason }`. With no answer in time, the reason is `no-answer`. Send it right after a tap: Eva
 * checks that the person tapped.
 */
function askEva(message, waitMs) {
  if (window.parent === window) return Promise.resolve({ ok: false, reason: "no-eva" });
  askCount += 1;
  const id = askCount;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waitingAsks.delete(id);
      resolve({ ok: false, reason: "no-answer" });
    }, waitMs);
    waitingAsks.set(id, (answer) => {
      clearTimeout(timer);
      resolve(answer);
    });
    window.parent.postMessage({ eva: "widget", id, ...message }, "*");
  });
}

/** Asks Eva what she allows. Outside Eva no answer comes, and the entries that need her stay hidden. */
async function greetEva() {
  const answer = await askEva({ ask: "hello" }, 400);
  const asks = answer.ok && Array.isArray(answer.asks) ? answer.asks : [];
  evaAsks = new Set(asks.filter((type) => type === "chat" || type === "open"));
}

const refusals = {
  "no-tap": "Eva needs a tap for this. Try again.",
  "too-long": "The text is too long for Eva.",
  "not-found": "Eva could not find this file.",
};

/** Asks Eva to chat or to open, and says why when she does not. */
async function askEvaTo(type, payload) {
  const answer = await askEva({ ask: type, ...payload }, 5000);
  if (answer.ok) return;
  if (answer.reason === "not-allowed") {
    // The person has not approved this ask: the entry hides until the widget loads again.
    evaAsks.delete(type);
    showNote("Eva does not allow this yet. Approve it in Settings > Personalize > Widgets.");
    return;
  }
  showNote(refusals[answer.reason] ?? "Eva could not do this. Try again.");
}

/** The path of a habit's file in the vault, such as `Life/Habits/read.json`. */
function vaultPath(file) {
  return folderPath === "" ? file : `${folderPath}/${file}`;
}

/** A short text for a chat with Eva about a habit: its name, its file and how it goes. */
function chatText({ file, habit }, numbers, today) {
  const facts = [frequencyText(habit)];
  const target = targetText(habit);
  if (target !== "") facts.push(target.toLowerCase());
  facts.push(`current streak ${days(currentStreak(numbers, today))}`, `strength ${percent(numbers.strength)}`);
  if (isArchived(habit)) facts.push("archived");
  return `Let us talk about my habit "${String(habit.name)}" (${vaultPath(file)}). ${facts.join("; ")}.`.slice(0, 2000);
}

/** Three dots, drawn here, for the button of a menu. */
function dots() {
  const mark = svg("svg", { viewBox: "0 0 24 24", class: "dots", "aria-hidden": "true" });
  for (const y of [5, 12, 19]) mark.append(svg("circle", { cx: 12, cy: y, r: 2 }));
  return mark;
}

/** The button that opens the menu of a habit. */
function moreButton(file, habit, place = "row") {
  const node = button("more-button");
  node.setAttribute("aria-label", `${String(habit.name)}, more`);
  node.setAttribute("aria-haspopup", "menu");
  node.setAttribute("aria-expanded", "false");
  node.dataset.focusKey = `${file}|more|${place}`;
  node.append(dots());
  node.addEventListener("click", () => {
    node.setAttribute("aria-expanded", "true");
    openHabitMenu(file, node.getBoundingClientRect(), node);
  });
  return node;
}

/**
 * The menu of a habit: today's check or value, a skip of today, its details and settings, the
 * archive, and, when Eva allows them, its file in Files and a chat about it.
 */
function openHabitMenu(file, anchor, returnFocus) {
  const entry = entryOf(file);
  if (entry === undefined) return;
  const { habit } = entry;
  const today = todayNumber();
  const numbers = facts(habit, today);
  const date = dateOf(today);
  const isSkipped = numbers.skipped.has(today);
  const items = [];
  if (isNumberHabit(habit)) {
    const label = numbers.checked.has(today) ? "Change today's value…" : "Enter today's value…";
    items.push({ label, action: () => askValue(file, today) });
  } else {
    const label = numbers.done.has(today) ? "Unmark today" : "Mark today done";
    items.push({ label, action: () => toggle(file, today) });
  }
  items.push({
    label: isSkipped ? "Unskip today" : "Skip today",
    action: () => save(file, (latest) => withSkip(latest, date, !isSkipped)),
  });
  // A small card has no room for the details: Eva's full-screen button shows them.
  if (root.dataset.size !== "small") {
    items.push({ label: "See history", action: () => openDetail(file) });
    items.push({ label: "Edit habit", action: () => openDetail(file, "settings") });
  }
  items.push({
    label: isArchived(habit) ? "Unarchive" : "Archive",
    action: () => {
      save(file, (latest) => withArchived(latest, !isArchived(latest)));
      if (isArchived(entryOf(file)?.habit) && !(isOverview() && state.showArchived)) {
        showNote(`${String(habit.name)} is archived. Full screen shows it under Archived.`);
      }
    },
  });
  const help = [];
  if (evaAsks.has("open") && folderPath !== "") {
    help.push({ label: "Open in Files", role: "open", action: () => askEvaTo("open", { path: vaultPath(file) }) });
  }
  if (evaAsks.has("chat")) {
    help.push({
      label: "Start a chat about this habit",
      role: "chat",
      action: () => askEvaTo("chat", { text: chatText(entry, numbers, today) }),
    });
  }
  if (help.length > 0) items.push({ separator: true }, ...help);
  openMenu(items, anchor, String(habit.name), returnFocus);
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

/** Adds or removes the check of a day of a yes or no habit. */
function toggle(file, day) {
  const date = dateOf(day);
  const isDone = facts(entryOf(file).habit, todayNumber()).done.has(day);
  save(file, (habit) => withDay(habit, date, isDone ? null : true));
}

/** Asks for the value of a day of a number habit, then saves it, removes it, or does nothing. */
function askValue(file, day) {
  const { habit } = entryOf(file);
  const date = dateOf(day);
  const today = todayNumber();
  const current = facts(habit, today).checked.get(day);
  const input = dialog.querySelector('input[name="value"]');
  dialog.querySelector('[data-role="value-title"]').textContent = `${String(habit.name)}, ${dayName(day, today)}`;
  const target = targetText(habit);
  dialog.querySelector('[data-role="value-unit"]').textContent = String(habit.unit ?? "");
  input.placeholder = target;
  dialog.querySelector('[data-role="value-remove"]').hidden = current === undefined;
  input.value = current === undefined ? "" : String(current);
  dialog.returnValue = "cancel";
  dialog.onclose = () => {
    const value = Number(input.value);
    if (dialog.returnValue === "remove") save(file, (latest) => withDay(latest, date, null));
    else if (dialog.returnValue === "save" && input.value !== "" && Number.isFinite(value) && value >= 0)
      save(file, (latest) => withDay(latest, date, value));
  };
  dialog.showModal();
  input.focus();
}

// --- The widget's own state in Eva ----------------------------------------------------------------

async function loadState() {
  const stored = await readJson("eva/state.json");
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return;
  storedState = stored;
  if (sortOrders.some((order) => order.id === stored.sort)) state.sort = stored.sort;
  if (typeof stored.showArchived === "boolean") state.showArchived = stored.showArchived;
}

/** Saves the sort order and the archived choice in Eva. Outside Eva the choice stays in memory. */
async function saveState() {
  storedState = { ...storedState, sort: state.sort, showArchived: state.showArchived };
  try {
    await fetch("eva/state.json", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(storedState),
    });
  } catch {
    // Outside Eva the path does not exist: the choice lasts until the page closes.
  }
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

function setUpToolbar() {
  sortElement.replaceChildren(
    ...sortOrders.map((order) => {
      const option = element("option", undefined, order.name);
      option.value = order.id;
      return option;
    }),
  );
  sortElement.value = state.sort;
  archivedElement.checked = state.showArchived;
  sortElement.addEventListener("change", () => {
    state.sort = sortElement.value;
    render();
    void saveState();
  });
  archivedElement.addEventListener("change", () => {
    state.showArchived = archivedElement.checked;
    render();
    void saveState();
  });
}

async function start() {
  const size = new URLSearchParams(window.location.search).get("size");
  // Opened alone in a browser, the widget shows its full-screen view.
  // The header slot of Eva's home page is one wide, short line: the chips of the small card fit it.
  root.dataset.size = size === "header" ? "small" : sizes.includes(size) ? size : "full";
  if (size === "header") root.dataset.slot = "header";
  // Eva's answer to hello comes while the files load: outside Eva, the wait costs nothing more.
  const [config] = await Promise.all([readJson("config.json"), loadState(), greetEva()]);
  if (typeof config?.title === "string" && config.title.trim() !== "") titleElement.textContent = config.title;
  if (typeof config?.habits === "string") folderPath = config.habits.trim().replace(/\/+$/, "");
  setUpToolbar();
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
  // The overview, the calendar and the charts show as much as fits the frame.
  let lastBox = `${String(root.clientWidth)}x${String(root.clientHeight)}`;
  // The small card shows as many chips as fit, also after the note shows below them.
  new ResizeObserver(() => fitChips()).observe(chipList);
  new ResizeObserver(() => {
    const box = `${String(root.clientWidth)}x${String(root.clientHeight)}`;
    if (box === lastBox) return;
    lastBox = box;
    closeMenu(false);
    if (root.dataset.size !== "small") render();
  }).observe(root);
  for (const close of dialog.querySelectorAll("[data-close]")) {
    close.addEventListener("click", () => dialog.close(close.dataset.close));
  }
  dialog.querySelector('input[name="value"]').addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // Without this, the Enter key also presses the habit's button, which gets the focus back.
    event.preventDefault();
    dialog.close("save");
  });
  menuElement.addEventListener("keydown", menuKeys);
  document.addEventListener("pointerdown", (event) => {
    if (!menuElement.hidden && !menuElement.contains(event.target)) closeMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menuElement.hidden) closeMenu(true);
  });
  // Tests wait for this flag: every part of the widget has its content now.
  root.dataset.ready = "true";
}

void start();
