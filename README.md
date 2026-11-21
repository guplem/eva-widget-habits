# Habits

A widget for [Eva](https://github.com/guplem/eva)'s home page. It tracks your habits: you mark each habit for today, and see its history, its streaks, its completion rate and its strength.

**Demo:** https://guplem.github.io/eva-widget-habits/

The demo uses made-up habits. A change in the demo shows on the screen only.

## What it does

- **Two kinds of habits.** A yes or no habit, such as "Read", or a number with a unit, such as "Meditate, 15 minutes". A number habit can have a target for each day: at least 10 minutes, or at most 2 cups.
- **A frequency for each habit:** every day, N times a week, N times a month, every N days, or N times in N days. The days between two checks of a weekly habit keep its streak.
- **A skip.** Skip a day on purpose, such as a sick day: it keeps the streak, and it does not lower the strength.
- **Each size adds to the smaller one:**
  - **Small** shows each habit as a chip with a round check mark, and how many are done today. The chips grow to fill the card. A tap on a chip marks the habit for today. When the chips do not fit, the card says how many more there are. In the header slot of Eva's home page, beside the greeting, the chips take the whole line.
  - **Medium** and **tall** show each habit with its strength ring, its last 6 days and a button for today.
  - **Large**, **extra large** and **full screen** show the overview: each habit as a row with its strength in the ring, its frequency and its streak, a check cell for each of its last days (as many as fit), and today's button. A tap on a past day checks it. Above the rows: the names of the days, the sort order (name, strength, to do first, colour) and **Archived**, to show the archived habits. A short card, such as a large card on a computer, keeps its height for the rows.
  - **The details of a habit** show beside the overview when the frame is at least 760 × 420 pixels, and in its place on a phone, with **‹ All habits** to go back. A tap on the name of a habit opens them. They show its question, frequency and target, its strength, current and best streak and total, its completion rate over the last week, month, year and all the time, a calendar of its history, a bar chart by week or by month, its best days of the week, its best streaks, its note, and **Edit habit**.
- **Edit habit** changes the name, the question, the frequency, the target and unit of a number habit, the colour and the note. **Archive** hides a habit from the cards and keeps its history.
- **The menu of a habit.** The "more" button (⋮) at the end of each row and in the details, or a long press or a right click on a chip or on the name of a habit, opens it: mark or unmark today (or its value), skip today, **See history**, **Edit habit**, **Archive**, and, inside Eva, **Open in Files** and **Start a chat about this habit**. The chat puts a short text in Eva's message box, such as `Let us talk about my habit "Read" (Life/Habits/read.json). Every day; current streak 4 days; strength 62%.`, and Eva never sends it by herself. The quick tap on today's check stays the fastest way. The keyboard works: Enter opens the menu, the arrow keys, Home and End move, and Escape closes it.
- **The day menu.** A tap on a day of the calendar, or a long press or a right click on a day of a row, opens a menu: done (or the value of a number habit), skipped, or not done. The arrow keys move between the days of the calendar.
- **Eva's corner stays free.** Each size keeps the top right corner of 56 × 56 pixels free for Eva's full-screen and close buttons. A menu never covers it.
- The widget reads the folder again each time the page shows. So a check that Eva writes in a chat shows with no reload.
- **What Eva may do for it.** Eva asks you to approve two things when you turn the widget on: to open a habit's file in Files, and to put a text in her message box. Outside Eva, or before you approve them, the two entries do not show.
- **Your choices sync.** The sort order and **Archived** live in Eva, in the widget's own state, so each device shows the same. Outside Eva they last until the page closes.

### What Loop Habit Tracker has that this widget leaves out

The widget follows the ideas of the Android app [Loop Habit Tracker](https://github.com/isoron/uhabits), with its own code. It leaves out:

- **Reminders and notifications.** A widget cannot send a notification. Ask Eva for a reminder instead.
- **New and deleted habits.** Ask Eva: "I want to read every day." Eva writes the file. To delete a habit, archive it, or ask Eva.
- Home screen widgets of the phone, export and import of CSV or of a database, a manual order by drag and drop, habit groups, and the themes and languages of the app.

## The data

You pick a folder of your vault. The default is `Life/Habits`: when you turn the widget on, Eva offers **Use the default folder**, or **Create the default folder** when it does not exist yet. You can pick any other folder too. `Life/Habits` is a folder of Eva's vault map, for habits of any kind: reading, exercise, a behaviour to keep or to stop.

**Did you pick `Life/Health/Habits`, the default of an older version?** The widget keeps the folder that you picked: a new default never moves your data. To use `Life/Habits`, move your habit files there, then remove the widget in **Settings > Personalize > Widgets** and turn it on again with **Use the default folder**.

Each habit is one JSON file in the folder, such as `meditate.json`. [`schemas/habits.json`](schemas/habits.json) describes the file, and [`data/habits/`](data/habits/) holds the made-up files of the demo. `node scripts/mock-habits.js` writes them again.

```json
{
  "name": "Meditate",
  "kind": "number",
  "question": "How many minutes did you meditate today?",
  "unit": "minutes",
  "target": { "value": 10, "type": "atLeast" },
  "frequency": { "times": 1, "days": 1 },
  "color": "#7c5cd6",
  "checks": [{ "date": "2026-01-01", "value": 10 }],
  "skips": [{ "date": "2026-01-02", "note": "Ill" }],
  "note": "After breakfast."
}
```

- `name`, `kind`, `frequency` and `checks` are required. Each other field is optional, so a file of an older version still works.
- `kind` is `yesNo` or `number`.
- `frequency` reads "`times` in `days`": `{ "times": 3, "days": 7 }` is three times a week, and `{ "times": 1, "days": 3 }` is every 3 days.
- A day is done when it has a check. A number check counts with the sum of the day's values: with no `target`, a value above 0 is done; `atLeast` needs the target or more; `atMost` needs the target or less.
- `skips` lists the days skipped on purpose. A check and a skip of the same day: the check wins.
- `color` is `#rrggbb`. The widget shows the nearest of its 8 colours.
- `archived: true` hides the habit from the cards.
- The widget keeps every field that it does not know, also inside each check.

## How it counts

[`habits.js`](habits.js) holds the numbers, with no page code, so `tests/habits.test.js` tests them in Node. A day is a calendar day of your time zone, so a clock change never adds or loses a day. A check or a skip after today counts for nothing yet.

- **Covered days.** A day is covered when the `days` days that end on it hold `times` done or skipped days at least. For "3 times a week", each day is covered while the last seven days hold three checks.
- **A streak** is a run of covered days. The current streak ends today or yesterday, because today is not over yet.
- **The completion rate** of a period is the done days divided by the done days that the frequency asks for in it, up to 100%. The periods are the last 7, 30 and 365 days, and all the time since the first check. A skipped day leaves the period. Today counts once it is done or skipped. So a daily habit done 6 of the last 7 days scores 86%, and "3 times a week" done 3 times scores 100%.
- **The strength** goes from 0% to 100%, in the spirit of Loop's habit score. It starts at 0 on the first day with a check or a skip. Each day `d` moves it a step toward that day's target:

  ```text
  strength(d) = strength(d - 1) + (target(d) - strength(d - 1)) × (1 - 0.5^(1/14))
  target(d)   = min(1, credits in the last `days` days / times)
  ```

  A done or a skipped day gives a credit of 1. A day under an "at least" target gives its part, such as 0.5 for 5 of 10 minutes. A skipped day leaves the strength as it is. Today moves it only once it is covered. So the strength moves half of the way to its target in 14 days: a missed day costs a strong habit about 5 points, and two weeks of checks build it again.

## Add it to Eva

Eva ships this widget, off: turn it on in **Settings > Personalize > Widgets**. Another Eva adds it by its address: `https://github.com/guplem/eva-widget-habits`. Eva asks for the folder and shows the permissions when you turn it on.

## Run it on your computer

A browser does not run the widget from a double-click on `index.html`. Run a small web server instead:

```sh
npm install
npm start
```

Then open http://localhost:3000/. Add `?size=small`, `medium`, `tall`, `large`, `xlarge` or `full` to the address to see each size.

## Change it

The widget follows the [widget contract](https://github.com/guplem/eva/blob/main/docs/widgets.md) of Eva. `AGENTS.md` says how to work on it, for people and for coding agents. `npm run check` runs every check.

## License

MIT. See [`LICENSE`](LICENSE).
