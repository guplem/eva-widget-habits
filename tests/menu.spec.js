// The menu of a habit, with a fake parent page that answers the asks of contract 3 as Eva does.
import { expect, test } from "@playwright/test";
import { fakeHabits, fakeWrites, fixToday } from "./helpers.js";

const today = "2026-03-10";

function testHabits() {
  return {
    "read.json": {
      name: "Read",
      kind: "yesNo",
      frequency: { times: 1, days: 1 },
      checks: [{ date: "2026-03-08" }, { date: "2026-03-09" }],
    },
    "meditate.json": {
      name: "Meditate",
      kind: "number",
      unit: "minutes",
      target: { value: 10, type: "atLeast" },
      frequency: { times: 1, days: 1 },
      checks: [],
    },
  };
}

/**
 * Opens the widget in a frame of a fake Eva page. `asks` is what Eva approves, or null for a page
 * that never answers. `refuse` makes Eva answer each chat and open with that reason. The page keeps
 * each message in `window.received`.
 */
async function openInEva(
  page,
  { size = "medium", width = 640, height = 200, asks = ["chat", "open"], refuse = null } = {},
) {
  await fixToday(page, today);
  await fakeHabits(page, testHabits());
  await page.route("**/fake-eva.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0">
<iframe id="widget" src="/?size=${size}" style="border:0;width:${String(width)}px;height:${String(height)}px"></iframe>
<script>
  window.received = [];
  const asks = ${JSON.stringify(asks)};
  const refuse = ${JSON.stringify(refuse)};
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.eva !== "widget" || "ok" in message) return;
    window.received.push(message);
    if (asks === null) return;
    const answer = message.ask === "hello" ? { ok: true, asks } : refuse === null ? { ok: true } : { ok: false, reason: refuse };
    event.source.postMessage({ eva: "widget", id: message.id, ...answer }, "*");
  });
</script></body></html>`,
    }),
  );
  await page.goto("/fake-eva.html");
  const frame = page.frameLocator("#widget");
  await expect(frame.locator(".widget")).toHaveAttribute("data-ready", "true");
  return frame;
}

const received = (page) => page.evaluate(() => window.received.filter((message) => message.ask !== "hello"));

test("the more button opens the menu of a habit, and Open in Files asks Eva for its file", async ({ page }) => {
  const frame = await openInEva(page);
  const more = frame.getByRole("button", { name: "Read, more" });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const menu = frame.getByRole("menu", { name: "Read" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Mark today done",
    "Skip today",
    "See history",
    "Edit habit",
    "Archive",
    "Open in Files",
    "Start a chat about this habit",
  ]);
  await menu.getByRole("menuitem", { name: "Open in Files" }).click();
  await expect
    .poll(() => received(page))
    .toEqual([{ eva: "widget", id: 2, ask: "open", path: "Life/Habits/read.json" }]);
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("Start a chat sends a short text that names the habit and its file", async ({ page }) => {
  const frame = await openInEva(page);
  await frame.getByRole("button", { name: "Read, more" }).click();
  await frame.getByRole("menuitem", { name: "Start a chat about this habit" }).click();
  await expect
    .poll(() => received(page))
    .toEqual([
      {
        eva: "widget",
        id: 2,
        ask: "chat",
        text: 'Let us talk about my habit "Read" (Life/Habits/read.json). Every day; current streak 2 days; strength 9%.',
      },
    ]);
});

test("the widget asks hello once with no tap, and hides what Eva does not allow", async ({ page }) => {
  const frame = await openInEva(page, { asks: ["open"] });
  const hello = await page.evaluate(() => window.received);
  expect(hello).toEqual([{ eva: "widget", id: 1, ask: "hello" }]);
  await frame.getByRole("button", { name: "Read, more" }).click();
  await expect(frame.getByRole("menuitem", { name: "Open in Files" })).toBeVisible();
  await expect(frame.getByRole("menuitem", { name: "Start a chat about this habit" })).toHaveCount(0);
});

test("with no answer to hello, as outside Eva, the entries that need Eva do not show", async ({ page }) => {
  const frame = await openInEva(page, { asks: null });
  await frame.getByRole("button", { name: "Read, more" }).click();
  await expect(frame.getByRole("menuitem")).toHaveText([
    "Mark today done",
    "Skip today",
    "See history",
    "Edit habit",
    "Archive",
  ]);
});

test("the demo page alone shows the menu with the widget's own entries only", async ({ page }) => {
  await fixToday(page, today);
  await fakeHabits(page, testHabits());
  await page.goto("/?size=medium");
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Read, more" }).click();
  await expect(page.getByRole("menuitem", { name: "Open in Files" })).toHaveCount(0);
});

test("when Eva refuses an ask that the person did not approve, the widget says how, and hides the entry", async ({
  page,
}) => {
  const frame = await openInEva(page, { refuse: "not-allowed" });
  await frame.getByRole("button", { name: "Read, more" }).click();
  await frame.getByRole("menuitem", { name: "Open in Files" }).click();
  await expect(frame.locator('[data-role="note"]')).toHaveText(
    "Eva does not allow this yet. Approve it in Settings > Personalize > Widgets.",
  );
  await frame.getByRole("button", { name: "Read, more" }).click();
  await expect(frame.getByRole("menuitem", { name: "Open in Files" })).toHaveCount(0);
  await expect(frame.getByRole("menuitem", { name: "Start a chat about this habit" })).toBeVisible();
});

test("Mark today done and Skip today change the file, and the keyboard reaches each entry", async ({ page }) => {
  const writes = await fakeWrites(page);
  const frame = await openInEva(page);
  const more = frame.getByRole("button", { name: "Read, more" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(frame.getByRole("menuitem", { name: "Mark today done" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(frame.getByRole("menuitem", { name: "Start a chat about this habit" })).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(frame.getByRole("menuitem", { name: "Skip today" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.skips).toEqual([{ date: today }]);
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(frame.getByRole("menuitem", { name: "Unskip today" })).toBeVisible();
  await frame.getByRole("menuitem", { name: "Mark today done" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body.checks.at(-1)).toEqual({ date: today });
  expect("skips" in writes[1].body).toBe(false);
});

test("Edit habit opens the details with the settings, and See history opens them in a medium card", async ({
  page,
}) => {
  const frame = await openInEva(page, { width: 640, height: 320 });
  await frame.getByRole("button", { name: "Read, more" }).click();
  await frame.getByRole("menuitem", { name: "Edit habit" }).click();
  await expect(frame.locator(".widget")).toHaveAttribute("data-view", "detail");
  await expect(frame.locator('[data-role="settings"]')).toHaveAttribute("open", "");
  await expect(frame.locator('[data-role="settings"] input[name="name"]')).toBeFocused();
  await frame.getByRole("button", { name: "‹ All habits" }).click();
  await frame.getByRole("button", { name: "Meditate, more" }).click();
  await frame.getByRole("menuitem", { name: "See history" }).click();
  await expect(frame.locator(".detail-name")).toHaveText("Meditate");
  await expect(frame.getByRole("menuitem", { name: "Enter today's value…" })).toHaveCount(0);
});

test("a number habit offers its value, and a small card leaves out the details", async ({ page }) => {
  const frame = await openInEva(page, { size: "small", width: 300, height: 170 });
  await frame.getByRole("button", { name: "Meditate, today" }).click({ button: "right" });
  await expect(frame.getByRole("menuitem")).toHaveText([
    "Enter today's value…",
    "Skip today",
    "Archive",
    "Open in Files",
    "Start a chat about this habit",
  ]);
});

test("the menu stays inside a small frame and off Eva's corner", async ({ page }) => {
  const frame = await openInEva(page, { size: "small", width: 300, height: 170 });
  const chip = frame.getByRole("button", { name: "Read, today" });
  const box = await chip.boundingBox();
  // A right click near the right end of the chip, close to Eva's corner.
  await chip.click({ button: "right", position: { x: box.width - 24, y: box.height / 2 } });
  const menu = frame.getByRole("menu");
  await expect(menu).toBeVisible();
  const placed = await menu.boundingBox();
  expect(placed.x).toBeGreaterThanOrEqual(0);
  expect(placed.y).toBeGreaterThanOrEqual(0);
  expect(placed.x + placed.width).toBeLessThanOrEqual(300 + 0.5);
  expect(placed.y + placed.height).toBeLessThanOrEqual(170 + 0.5);
  expect(placed.x + placed.width <= 300 - 56 || placed.y >= 56).toBe(true);
});

test("the details have a more button too", async ({ page }) => {
  const frame = await openInEva(page, { size: "full", width: 1000, height: 700 });
  await frame.locator(".detail-header").getByRole("button", { name: "Meditate, more" }).click();
  await expect(frame.getByRole("menu", { name: "Meditate" })).toBeVisible();
});

test("the menu of a small card of Eva's grid (203 x 150) keeps off Eva's corner, and scrolls to its last entry", async ({
  page,
}) => {
  const frame = await openInEva(page, { size: "small", width: 203, height: 150 });
  const chip = frame.getByRole("button", { name: "Read, today" });
  await chip.click({ button: "right" });
  const menu = frame.getByRole("menu");
  await expect(menu).toBeVisible();
  const placed = await menu.boundingBox();
  expect(placed.y).toBeGreaterThanOrEqual(0);
  expect(placed.y + placed.height).toBeLessThanOrEqual(150 + 0.5);
  expect(placed.x + placed.width <= 203 - 56 || placed.y >= 56).toBe(true);
  const last = menu.getByRole("menuitem", { name: "Start a chat about this habit" });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});
