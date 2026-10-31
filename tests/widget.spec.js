import { expect, test } from "@playwright/test";
import { fakeHabits, fakeWrites, fixToday } from "./helpers.js";

const today = "2026-03-10";

/** Test habits: a yes or no habit, a number habit and a weekly habit. */
function testHabits() {
  return {
    "meditate.json": {
      name: "Meditate",
      kind: "number",
      unit: "minutes",
      frequency: { times: 1, days: 1 },
      checks: [
        { date: "2026-03-07", value: 10 },
        { date: "2026-03-08", value: 12 },
        { date: "2026-03-09", value: 15, note: "A long one" },
      ],
    },
    "read.json": {
      name: "Read",
      kind: "yesNo",
      frequency: { times: 1, days: 1 },
      checks: [{ date: "2026-03-01" }, { date: "2026-03-02" }, { date: "2026-03-03" }, { date: "2026-03-09" }],
      tags: ["evening"],
      shelf: "kitchen",
    },
    "walk.json": {
      name: "Walk",
      kind: "yesNo",
      frequency: { times: 3, days: 7 },
      checks: [{ date: "2026-03-04" }],
    },
  };
}

async function open(page, size, habits = testHabits()) {
  await fixToday(page, today);
  await fakeHabits(page, habits);
  await page.goto(`/?size=${size}`);
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
}

test("the card shows the title of config.json, each habit with its frequency, and today's count", async ({ page }) => {
  await open(page, "medium");
  await expect(page.locator(".widget-title")).toHaveText("Habits");
  await expect(page.locator(".habit-name")).toHaveText(["Meditate", "Read", "Walk"]);
  await expect(page.locator(".habit-frequency")).toHaveText(["Every day", "Every day", "3 times a week"]);
  await expect(page.locator('[data-role="summary"]')).toHaveText("0 of 3 done today");
});

test("the card shows the strength of each habit", async ({ page }) => {
  await open(page, "medium");
  const rings = page.locator(".habit .strength-ring");
  await expect(rings).toHaveCount(3);
  await expect(rings.nth(1)).toHaveAttribute("aria-label", /^Strength \d+%$/);
});

test("a check writes the whole habit file, with the fields that the widget does not know", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "medium");
  const button = page.getByRole("button", { name: "Read, today" });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-role="summary"]')).toHaveText("1 of 3 done today");
  await expect.poll(() => writes.length).toBe(1);
  const habit = testHabits()["read.json"];
  expect(writes[0]).toEqual({
    method: "PUT",
    path: "data/habits/read.json",
    body: { ...habit, checks: [...habit.checks, { date: today }] },
  });
  await expect(page.locator('[data-role="note"]')).toBeHidden();
});

test("a second press removes today's check", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "medium");
  const button = page.getByRole("button", { name: "Walk, today" });
  await button.click();
  await expect.poll(() => writes.length).toBe(1);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body.checks).toEqual([{ date: "2026-03-04" }]);
});

test("three habits fit a medium card of Eva with no scroll", async ({ page }) => {
  await page.setViewportSize({ width: 370, height: 165 });
  await open(page, "medium");
  const list = page.locator(".habit-list");
  expect(await list.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
});

test("the page has no form, because Eva's sandbox blocks a form submit", async ({ page }) => {
  await open(page, "medium");
  await expect(page.locator("form")).toHaveCount(0);
});

test("the Enter key saves the value of a number habit", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "medium");
  await page.getByRole("button", { name: "Meditate, today" }).click();
  await page.getByRole("dialog").getByRole("spinbutton").fill("7");
  await page.keyboard.press("Enter");
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks.at(-1)).toEqual({ date: today, value: 7 });
});

test("a number habit asks for the value, and saves it with its unit", async ({ page }) => {
  const writes = await fakeWrites(page);
  await open(page, "medium");
  await page.getByRole("button", { name: "Meditate, today" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Meditate");
  await expect(dialog).toContainText("minutes");
  await dialog.getByRole("spinbutton").fill("20");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Meditate, today" })).toHaveText("20");
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks.at(-1)).toEqual({ date: today, value: 20 });
  expect(writes[0].body.checks[2]).toEqual({ date: "2026-03-09", value: 15, note: "A long one" });
});

test("a number habit changes today's value, and keeps the other fields of the check", async ({ page }) => {
  const habits = testHabits();
  habits["meditate.json"].checks.push({ date: today, value: 5, note: "Short" });
  const writes = await fakeWrites(page);
  await open(page, "medium", habits);
  await page.getByRole("button", { name: "Meditate, today" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton")).toHaveValue("5");
  await dialog.getByRole("spinbutton").fill("8");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks.at(-1)).toEqual({ date: today, value: 8, note: "Short" });
});

test("Remove takes away today's value of a number habit, and Cancel writes nothing", async ({ page }) => {
  const habits = testHabits();
  habits["meditate.json"].checks.push({ date: today, value: 5 });
  const writes = await fakeWrites(page);
  await open(page, "medium", habits);
  const button = page.getByRole("button", { name: "Meditate, today" });
  await button.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await button.click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks.map((check) => check.date)).not.toContain(today);
});

test("outside Eva, a write fails, and the change shows on the screen only, with the demo note", async ({ page }) => {
  await open(page, "medium");
  await page.getByRole("button", { name: "Walk, today" }).click();
  await expect(page.getByRole("button", { name: "Walk, today" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-role="note"]')).toHaveText("This is a demo: the change shows on this screen only.");
});

test("when Eva refuses a write, the widget says so and shows the file as it is", async ({ page }) => {
  await open(page, "medium");
  await page.route("**/data/habits/walk.json", (route) =>
    route.request().method() === "PUT" ? route.fulfill({ status: 422 }) : route.fallback(),
  );
  await page.getByRole("button", { name: "Walk, today" }).click();
  await expect(page.locator('[data-role="note"]')).toHaveText("Eva could not save this change. Try again.");
  await expect(page.getByRole("button", { name: "Walk, today" })).toHaveAttribute("aria-pressed", "false");
});

test("when the write does not reach Eva, the widget says so", async ({ page }) => {
  await open(page, "medium");
  await page.route("**/data/habits/walk.json", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.fallback(),
  );
  await page.getByRole("button", { name: "Walk, today" }).click();
  await expect(page.locator('[data-role="note"]')).toHaveText("Eva could not save this change. Try again.");
});

test("a check keeps a check that Eva wrote after the widget read the folder", async ({ page }) => {
  const habits = testHabits();
  const writes = await fakeWrites(page);
  await open(page, "medium", habits);
  // An agent of Eva writes yesterday's check while the page stays visible.
  habits["walk.json"].checks.push({ date: "2026-03-09" });
  await page.getByRole("button", { name: "Walk, today" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks).toEqual([{ date: "2026-03-04" }, { date: "2026-03-09" }, { date: today }]);
});

test("the folder is read again after a write that was on its way", async ({ page }) => {
  const habits = testHabits();
  let release = () => {};
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await open(page, "medium", habits);
  await page.route("**/data/habits/walk.json", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await held;
    return route.fulfill({ status: 204 });
  });
  await page.getByRole("button", { name: "Walk, today" }).click();
  habits["read.json"].checks.push({ date: today });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  release();
  await expect(page.getByRole("button", { name: "Read, today" })).toHaveAttribute("aria-pressed", "true");
});

test("the value of a number habit is the sum of today's checks, and a save keeps one check", async ({ page }) => {
  const habits = testHabits();
  habits["meditate.json"].checks.push({ date: today, value: 10, note: "Morning" }, { date: today, value: 5 });
  const writes = await fakeWrites(page);
  await open(page, "medium", habits);
  const button = page.getByRole("button", { name: "Meditate, today" });
  await expect(button).toHaveText("15");
  await button.click();
  await expect(page.getByRole("dialog").getByRole("spinbutton")).toHaveValue("15");
  await page.getByRole("dialog").getByRole("spinbutton").fill("20");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(button).toHaveText("20");
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.checks.filter((check) => check.date === today)).toEqual([
    { date: today, value: 20, note: "Morning" },
  ]);
});

test("a page that stays open moves to the next day at midnight", async ({ page }) => {
  const habits = testHabits();
  habits["read.json"].checks.push({ date: today });
  await page.clock.install({ time: new Date(`${today}T23:59:30`) });
  await fakeHabits(page, habits);
  await page.goto("/?size=medium");
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  await expect(page.locator('[data-role="summary"]')).toHaveText("1 of 3 done today");
  await page.clock.runFor(61_000);
  await expect(page.locator('[data-role="summary"]')).toHaveText("0 of 3 done today");
});

test("the card shows the last days of each habit", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 400 });
  await open(page, "medium");
  const read = page.locator(".habit").nth(1);
  await expect(read.locator(".habit-day")).toHaveCount(6);
  await expect(read.locator(".habit-day.is-done")).toHaveCount(1);
  await expect(read.locator(".habit-day").last()).toHaveAttribute("title", /done/);
});

test("the small size shows the count only", async ({ page }) => {
  await open(page, "small");
  await expect(page.locator('[data-role="summary"]')).toHaveText("0 of 3 done today");
  await expect(page.locator(".habit-list")).toBeHidden();
});

test("full screen shows the strength, the streaks and the history of the first habit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "full");
  const detail = page.locator('[data-role="detail"]');
  await expect(detail.locator(".detail-name")).toHaveText("Meditate");
  await expect(detail.locator('[data-stat="current"] .stat-value')).toHaveText("3 days");
  await expect(detail.locator('[data-stat="best"] .stat-value')).toHaveText("3 days");
  await expect(detail.locator('[data-stat="total"] .stat-value')).toHaveText("37 minutes");
  await expect(detail.locator('[data-stat="strength"] .stat-value')).toHaveText(/^\d+%$/);
  await expect(detail.locator(".calendar-day.is-done")).toHaveCount(3);
  await expect(detail.locator(".streak")).toHaveCount(1);
  await expect(detail.locator(".streak").first()).toContainText("3 days");
});

test("full screen shows the habit that the person picks", async ({ page }) => {
  await open(page, "full");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  const detail = page.locator('[data-role="detail"]');
  await expect(detail.locator(".detail-name")).toHaveText("Read");
  await expect(detail.locator('[data-stat="best"] .stat-value')).toHaveText("3 days");
  await expect(detail.locator('[data-stat="current"] .stat-value')).toHaveText("1 day");
  await expect(detail.locator('[data-stat="total"] .stat-value')).toHaveText("4 days");
  await expect(detail.locator(".streak")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Read", exact: true })).toHaveAttribute("aria-current", "true");
});

test("the widget reads the folder again when the page shows again", async ({ page }) => {
  const habits = testHabits();
  await open(page, "medium", habits);
  await expect(page.getByRole("button", { name: "Read, today" })).toHaveAttribute("aria-pressed", "false");
  // An agent of Eva writes a check in a chat.
  habits["read.json"].checks.push({ date: today });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: "Read, today" })).toHaveAttribute("aria-pressed", "true");
});

test("an empty folder says how to add a habit", async ({ page }) => {
  await open(page, "medium", {});
  await expect(page.locator('[data-role="summary"]')).toHaveText("No habits yet.");
  await expect(page.locator(".habit-empty")).toContainText("Ask Eva");
});

test("a broken habit file does not stop the others", async ({ page }) => {
  const habits = { ...testHabits(), "broken.json": { kind: "yesNo" } };
  await open(page, "medium", habits);
  await expect(page.locator(".habit-name")).toHaveText(["Meditate", "Read", "Walk"]);
});

test("the mock data of the demo shows on GitHub Pages", async ({ page }) => {
  await page.goto("/?size=medium");
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".habit-name")).toHaveText(["Meditate", "Read", "Walk"]);
});

test("the widget follows the dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "medium");
  const light = await page.locator(".widget").evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.locator(".widget").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(dark).not.toBe(light);
});

test("the demo server answers a broken address with 404, and keeps running", async ({ request }) => {
  expect((await request.get("/%E0%A4%A")).status()).toBe(404);
  expect((await request.get("/")).status()).toBe(200);
});
