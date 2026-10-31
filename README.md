# Habits

A widget for [Eva](https://github.com/guplem/eva)'s home page. It tracks your habits: you mark each habit for today, and see its history, its streaks and its strength.

**Demo:** https://guplem.github.io/eva-widget-habits/

The demo uses mock data. A change in the demo shows on the screen only.

## What it does

- **Two kinds of habits.** A yes or no habit, such as "Read", or a number with a unit, such as "Meditate, 15 minutes".
- **A frequency for each habit,** such as "every day" or "3 times a week". The days between two checks of a weekly habit keep its streak.
- **The card** shows each habit with its strength ring, its last days and a button for today. A number habit asks for the value.
- **Full screen** shows the details of one habit: its strength, its current and best streak, its total, a calendar of its history, and its best streaks.
- **The small card** shows how many habits are done today.
- The widget reads the folder again each time the page shows. So a check that Eva writes in a chat shows with no reload.

Reminders are not part of the widget: a widget cannot send a notification.

## The data

You pick a folder of your vault, such as `Life/Habits/`. Each habit is one JSON file in it, such as `meditate.json`. [`schemas/habits.json`](schemas/habits.json) describes the file, and [`data/habits/`](data/habits/) holds the mock files of the demo.

```json
{
  "name": "Meditate",
  "kind": "number",
  "unit": "minutes",
  "frequency": { "times": 1, "days": 1 },
  "checks": [{ "date": "2026-01-01", "value": 10 }]
}
```

- `kind` is `yesNo` or `number`.
- `frequency` reads "`times` in `days`": `{ "times": 3, "days": 7 }` is three times a week.
- A day is done when it has a check. A number check counts when its value is above 0.

## How it counts

[`habits.js`](habits.js) holds the numbers, with no page code, so `tests/habits.test.js` tests them in Node.

- **Covered days.** A day is covered when it lies in a window of `days` days with `times` checks at least.
- **A streak** is a run of covered days. The current streak ends today or yesterday, because today is not over yet.
- **The strength** goes from 0% to 100%. Each day moves it a step toward the part of the target that the habit reached in its window. A run of checks or misses moves it half of the way in two weeks.

## Add it to Eva

Eva ships this widget, off: turn it on in **Settings > Personalize > Widgets**. Another Eva adds it by its address: `https://github.com/guplem/eva-widget-habits`. Eva asks for the folder and shows the permissions when you turn it on.

## Run it on your computer

A browser does not run the widget from a double-click on `index.html`. Run a small web server instead:

```sh
npm install
npm start
```

Then open http://localhost:3000/. Add `?size=small`, `medium`, `large` or `full` to the address to see each size.

## Change it

The widget follows the [widget contract](https://github.com/guplem/eva/blob/main/docs/widgets.md) of Eva. `AGENTS.md` says how to work on it, for people and for coding agents. `npm run check` runs every check.

## License

MIT. See [`LICENSE`](LICENSE).
