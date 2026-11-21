// The large sizes and full screen: the overview of every habit, the details of one habit, its
// settings, the day menu, the sort order and the archived habits.
import { expect, test } from "@playwright/test";
import { fakeHabits, fakeState, fakeWrites, fixToday } from "./helpers.js";

const today = "2026-03-10";

/** The dates from `from` to `to`, both included. */
function range(from, to) {
  const dates = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86_400_000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

function testHabits() {
  return {
    "meditate.json": {
      name: "Meditate",
      kind: "number",
      question: "How many minutes did you meditate?",
      unit: "minutes",
      target: { value: 10, type: "atLeast" },
      frequency: { times: 1, days: 1 },
      color: "#7c5cd6",
      checks: [
        { date: "2026-03-07", value: 10 },
        { date: "2026-03-08", value: 5 },
        { date: "2026-03-09", value: 15, note: "A long one" },
      ],
    },
    "read.json": {
      name: "Read",
      kind: "yesNo",
      frequency: { times: 1, days: 1 },
      checks: range("2026-02-20", "2026-03-09")
        .filter((date) => date !== "2026-03-05")
        .map((date) => ({ date })),
      skips: [{ date: "2026-03-05", note: "Travel" }],
      shelf: "kitchen",
    },
    "walk.json": {
      name: "Walk",
      kind: "yesNo",
      frequency: { times: 3, days: 7 },
      color: "#3f9c4f",
      checks: [{ date: "2026-03-04" }],
    },
    "journal.json": {
      name: "Journal",
      kind: "yesNo",
      frequency: { times: 1, days: 1 },
      archived: true,
      checks: [{ date: "2026-01-04" }],
    },
  };
}

async function open(page, size, { width = 1280, height = 800, habits = testHabits() } = {}) {
  await page.setViewportSize({ width, height });
  await fixToday(page, today);
  await fakeHabits(page, habits);
  await page.goto(`/?size=${size}`);
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
}

test("the overview shows each habit with its last days, the names of the days, and today's totals", async ({
  page,
}) => {
  await open(page, "large", { width: 1000, height: 400 });
  await expect(page.locator(".habit-name")).toHaveText(["Meditate", "Read", "Walk"]);
  await expect(page.locator('[data-role="summary"]')).toHaveText("0 of 3 done today");
  const read = page.locator('.habit[data-file="read.json"]');
  const cells = read.locator(".day-cell");
  expect(await cells.count()).toBeGreaterThan(6);
  await expect(read.locator('.day-cell[data-date="2026-03-09"]')).toHaveAttribute("aria-pressed", "true");
  await expect(read.locator('.day-cell[data-date="2026-03-05"]')).toHaveClass(/is-skipped/);
  await expect(read.locator(".habit-frequency")).toHaveText("Every day · 18-day streak");
  await expect(page.locator(".day-header-day.is-today")).toContainText("Tue");
  await expect(page.locator(".strength-ring .ring-text").first()).toHaveText(/^\d+$/);
});

test("a tap on a past day of the overview checks that day", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "large", { width: 1000, height: 400 });
  await page.getByRole("button", { name: "Walk, yesterday" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks).toEqual([{ date: "2026-03-04" }, { date: "2026-03-09" }]);
  await expect(page.getByRole("button", { name: "Walk, yesterday" })).toHaveAttribute("aria-pressed", "true");
});

test("a right click on a day offers to skip it, in a menu inside the frame and off Eva's corner", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "large", { width: 700, height: 340 });
  const check = page.getByRole("button", { name: "Walk, today" });
  await check.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: "Not done" })).toHaveAttribute("aria-checked", "true");
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(700);
  expect(box.y + box.height).toBeLessThanOrEqual(340);
  expect(box.x + box.width <= 700 - 56 || box.y >= 56).toBe(true);
  await expect(menu.getByRole("menuitemradio").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitemradio", { name: "Skipped" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(check).toBeFocused();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.skips).toEqual([{ date: today }]);
  await expect(page.locator('[data-role="summary"]')).toHaveText("0 of 3 done today · 1 skipped");
});

test("Escape closes the menu and gives the focus back", async ({ page }) => {
  await open(page, "large", { width: 1000, height: 400 });
  const cell = page.getByRole("button", { name: "Read, yesterday" });
  await cell.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(cell).toBeFocused();
});

test("a long press on a chip of the small size opens the day menu, and the press checks nothing", async ({
  page,
  browser,
}) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 300, height: 170 } });
  const touch = await context.newPage();
  const writes = await fakeWrites(touch);
  await fixToday(touch, today);
  await fakeHabits(touch, testHabits());
  await touch.goto("/?size=small");
  await expect(touch.locator(".widget")).toHaveAttribute("data-ready", "true");
  const chip = touch.getByRole("button", { name: "Read, today" });
  const box = await chip.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await chip.dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
  });
  await touch.waitForTimeout(650);
  await chip.dispatchEvent("pointerup", { pointerType: "touch", clientX: point.x, clientY: point.y, isPrimary: true });
  await chip.dispatchEvent("click");
  await expect(touch.getByRole("menu")).toBeVisible();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  expect(writes).toEqual([]);
  await context.close();
  expect(page).toBeTruthy();
});

test("full screen on a computer shows the list and the details side by side", async ({ page }) => {
  await open(page, "full");
  await expect(page.locator(".widget")).toHaveAttribute("data-view", "both");
  const detail = page.locator('[data-role="detail"]');
  await expect(detail.locator(".detail-name")).toHaveText("Meditate");
  await expect(detail.locator(".detail-question")).toHaveText("How many minutes did you meditate?");
  await expect(detail.locator(".detail-frequency")).toHaveText("Every day · At least 10 minutes");
  // 5 of 10 minutes is not done: the streak counts only the days that meet the target.
  await expect(detail.locator('[data-stat="current"] .stat-value')).toHaveText("1 day");
  await expect(detail.locator('[data-stat="total"] .stat-value')).toHaveText("30 minutes");
  await expect(detail.locator(".rate-name")).toHaveText(["Week", "Month", "Year", "All"]);
  await expect(detail.locator('[data-rate="all"] .rate-value')).toHaveText("67%");
  await expect(detail.locator("button.calendar-day[data-day]").filter({ hasText: "" }).first()).toBeAttached();
  await expect(detail.locator("button.calendar-day.is-partial")).toHaveCount(1);
  await expect(detail.locator(".bars").first().locator(".bar").first()).toBeAttached();
  await expect(detail.locator(".weekday-bars .bar")).toHaveCount(7);
});

test("the bar chart counts by week or by month", async ({ page }) => {
  await open(page, "full");
  await page.getByRole("button", { name: "Read, details" }).click();
  const detail = page.locator('[data-role="detail"]');
  const newest = detail.locator(".bars-box .bar").last();
  await expect(newest).toHaveAttribute("title", "Week of Mar 9: 1 day");
  await detail.getByRole("button", { name: "Month" }).click();
  await expect(detail.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  await expect(detail.locator(".bars-box .bar").last()).toHaveAttribute("title", "Mar: 8 days");
});

test("full screen on a phone shows the list, then the details of a habit in its place, with a way back", async ({
  page,
}) => {
  await open(page, "full", { width: 390, height: 824 });
  await expect(page.locator(".widget")).toHaveAttribute("data-view", "list");
  await expect(page.locator('[data-role="detail"]')).toBeHidden();
  await page.getByRole("button", { name: "Read, details" }).click();
  await expect(page.locator(".widget")).toHaveAttribute("data-view", "detail");
  await expect(page.locator('[data-role="overview"]')).toBeHidden();
  const back = page.getByRole("button", { name: "‹ All habits" });
  await expect(back).toBeFocused();
  await expect(page.locator(".detail-name")).toHaveText("Read");
  await back.click();
  await expect(page.locator(".widget")).toHaveAttribute("data-view", "list");
  await expect(page.getByRole("button", { name: "Read, details" })).toBeFocused();
});

test("a tap on a day of the calendar changes that day, and the arrow keys move between days", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "full");
  await page.getByRole("button", { name: "Walk, details" }).click();
  const grid = page.getByRole("grid");
  const todayCell = grid.locator('[tabindex="0"]');
  await expect(todayCell).toHaveAttribute("aria-label", "Tue, Mar 10: not done");
  await todayCell.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(grid.locator('[tabindex="0"]')).toHaveAttribute("aria-label", "Tue, Mar 3: not done");
  await page.keyboard.press("ArrowUp");
  const monday = grid.locator('[tabindex="0"]');
  await expect(monday).toHaveAttribute("aria-label", "Mon, Mar 2: not done");
  await expect(monday).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitemradio", { name: "Done", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks).toEqual([{ date: "2026-03-04" }, { date: "2026-03-02" }]);
});

test("the settings of a habit save into its file, with every field that the widget does not know", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "full");
  await page.getByRole("button", { name: "Read, details" }).click();
  const settings = page.locator('[data-role="settings"]');
  await settings.locator("summary").click();
  await settings.getByLabel("Name").fill("Read a book");
  await settings.getByLabel("Question").fill("Did you read 20 pages?");
  await settings.getByLabel("Frequency").selectOption("weekly");
  await settings.getByLabel("Times", { exact: true }).fill("5");
  await settings.getByRole("radio", { name: "Teal" }).check();
  await settings.getByLabel("Note").fill("Before bed");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  const habit = testHabits()["read.json"];
  expect(writes[0].body).toEqual({
    ...habit,
    name: "Read a book",
    question: "Did you read 20 pages?",
    frequency: { times: 5, days: 7 },
    color: "#2a9d8f",
    note: "Before bed",
  });
  await expect(page.locator(".detail-name")).toHaveText("Read a book");
  await expect(page.locator(".detail-frequency")).toHaveText("5 times a week");
});

test("the target of a number habit is part of its settings", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "full");
  const settings = page.locator('[data-role="settings"]');
  await settings.locator("summary").click();
  await settings.getByLabel("Target").selectOption("atMost");
  await settings.getByLabel("Value", { exact: true }).fill("20");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.target).toEqual({ value: 20, type: "atMost" });
  await settings.locator("summary").click({ trial: true });
  await page.locator('[data-role="settings"] [name="targetType"]').selectOption("none");
  await page.locator('[data-role="settings"]').getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect("target" in writes[1].body).toBe(false);
});

test("an archived habit leaves the cards and the count, and shows again on request", async ({ page }) => {
  const writes = await fakeWrites(page);
  const saved = await fakeState(page);
  await open(page, "full");
  await page.getByRole("button", { name: "Walk, details" }).click();
  await page.locator('[data-role="settings"] summary').click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.archived).toBe(true);
  await expect(page.locator('[data-role="summary"]')).toHaveText("0 of 2 done today");
  await expect(page.locator(".habit-name")).toHaveText(["Meditate", "Read"]);
  await page.getByLabel("Archived").check();
  await expect(page.locator(".habit-name")).toHaveText(["Journal", "Meditate", "Read", "Walk"]);
  await expect(page.locator('.habit[data-file="journal.json"]')).toHaveClass(/is-archived/);
  await expect.poll(() => saved.at(-1)).toEqual({ sort: "name", showArchived: true });
});

test("the sort order comes from Eva, and a new choice goes back to Eva with her other keys", async ({ page }) => {
  const saved = await fakeState(page, { sort: "strength", future: 1 });
  await open(page, "full");
  await expect(page.getByLabel("Sort")).toHaveValue("strength");
  await expect(page.locator(".habit-name").first()).toHaveText("Read");
  await page.getByLabel("Sort").selectOption("status");
  await expect.poll(() => saved.at(-1)).toEqual({ sort: "status", showArchived: false, future: 1 });
  await page.getByLabel("Sort").selectOption("name");
  await expect(page.locator(".habit-name")).toHaveText(["Meditate", "Read", "Walk"]);
});

test("outside Eva the sort order stays in memory", async ({ page }) => {
  await open(page, "full");
  await page.getByLabel("Sort").selectOption("color");
  await expect(page.locator(".habit-name")).toHaveText(["Walk", "Meditate", "Read"]);
});

test("a file of the old version, with no target, skip, colour or question, still shows", async ({ page }) => {
  const habits = {
    "old.json": {
      name: "Old",
      kind: "number",
      unit: "pages",
      frequency: { times: 1, days: 1 },
      checks: [{ date: "2026-03-09", value: 3 }],
    },
  };
  await open(page, "full", { habits });
  await expect(page.locator(".detail-frequency")).toHaveText("Every day");
  await expect(page.locator('[data-stat="current"] .stat-value')).toHaveText("1 day");
});
