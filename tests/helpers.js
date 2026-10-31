// Helpers for the widget tests. Outside Eva, a write fails, so a test that needs a write to work
// fakes it here, with no local server of Eva.

/**
 * Answers each PUT and DELETE of a contract data path as Eva does, and records it. Returns the
 * list of writes: `{ method, path, body }`, with the body parsed as JSON when it is JSON.
 */
export async function fakeWrites(page) {
  const writes = [];
  await page.route(
    (url) => url.pathname.startsWith("/data/"),
    async (route) => {
      const request = route.request();
      if (request.method() !== "PUT" && request.method() !== "DELETE") return route.fallback();
      const text = request.postData() ?? "";
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON, such as a YAML file: keep the text.
      }
      writes.push({ method: request.method(), path: new URL(request.url()).pathname.slice(1), body });
      return route.fulfill({ status: 204 });
    },
  );
  return writes;
}

/**
 * Answers the habits folder with these files, by file name, instead of the mock files. Change
 * the object later to change what the next read gets.
 */
export async function fakeHabits(page, files) {
  await page.route(
    (url) => url.pathname.startsWith("/data/habits/"),
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const name = decodeURIComponent(new URL(route.request().url()).pathname.slice("/data/habits/".length));
      const body = name === "index.json" ? Object.keys(files) : files[name];
      if (body === undefined) return route.fulfill({ status: 404 });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    },
  );
}

/** Fixes the clock of the page at noon of this local date, such as "2026-03-10". */
export async function fixToday(page, date) {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
}
