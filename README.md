# Habits

A widget for [Eva](https://github.com/guplem/eva)'s home page. It tracks your habits: you mark each habit for today, and see its history, its streaks and its strength.

**Demo:** https://guplem.github.io/eva-widget-habits/

The demo uses mock data. A change in the demo shows on the screen only.

## What it does

- **Two kinds of habits.** A yes or no habit, such as "Read", or a number with a unit, such as "Meditate, 15 minutes".
- **A frequency for each habit,** such as "every day" or "3 times a week". The days between two checks of a weekly habit keep its streak.
- **The card** shows each habit with its strength ring, its last days and a button for today. A number habit asks for the value.
- **Full screen** shows the details of one habit: its strength, its current and best streak, its total, a calendar of its history, and its best streaks.
- **The small card** shows each habit as a chip with a round check mark, and how many are done today. The chips grow to fill the card, in rows that share its height. A tap on a chip marks the habit for today. When the chips do not fit, the card says how many more there are: full screen shows them all.
- **Eva's corner stays free.** Each size keeps the top right corner of 56 x 56 pixels free for Eva's full-screen and close buttons.
- The widget reads the folder again each time the page shows. So a check that Eva writes in a chat shows with no reload.

Reminders are not part of the widget: a widget cannot send a notification.

## The data

You pick a folder of your vault. The default is `Life/Habits`: when you turn the widget on, Eva offers **Use the default folder**, or **Create the default folder** when it does not exist yet. You can pick any other folder too. `Life/Habits` is a folder of Eva's vault map, for habits of any kind: reading, exercise, a behaviour to keep or to stop.

**Did you pick `Life/Health/Habits`, the default of an older version?** The widget keeps the folder that you picked: a new default never moves your data. To use `Life/Habits`, move your habit files there, then remove the widget in **Settings > Personalize > Widgets** and turn it on again with **Use the default folder**. Each habit is one JSON file in it, such as `meditate.json`. [`schemas/habits.json`](schemas/habits.json) describes the file, and [`data/habits/`](data/habits/) holds the mock files of the demo.

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

- **Covered days.** A day is covered when the `days` days that end on it hold `times` checks at least. For "3 times a week", each day is covered while the last seven days hold three checks.
- A check dated after today counts for nothing yet.
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
