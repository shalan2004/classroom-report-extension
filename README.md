# Report Generator Homework Reports

A local Chrome/Chromium browser extension that speeds up grading homework
in Google Classroom: quick mistake/skipped-question counters (mouse +
keyboard shortcuts), automatic mark/percentage/understanding calculation,
and one-click WhatsApp-ready report generation.

No backend, no accounts, no cloud — everything is stored locally in the
browser via `chrome.storage.local`.

decisions — it's the source of truth for how this extension is built.

## Install (Developer Mode — no Chrome Web Store needed)

1. Unzip/copy this project folder somewhere on your computer.
2. Open Chrome (or Edge) and go to `chrome://extensions`.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked**.
5. Select this project's root folder (the one containing `manifest.json`).
6. The "Report Generator" extension icon should appear in your toolbar.

## Using it

1. Click the toolbar icon to open the popup.
2. Add your students under **Students** (one-time setup, reusable across
   homeworks).
3. Under **Homework Session**, create a new homework: enter the topic text
   exactly as you want it to appear in the report, and the number of
   questions. This becomes the *active* homework.
4. Open a student's submission in **Google Classroom**. A small floating
   panel appears in the bottom-right of the page.
5. Pick the student from the panel's dropdown (it will try to auto-fill
   this from the page, but always double-check it — see note below).
6. Grade as usual:
   - Press **M** or click `+1` for a mistake, **N** or `+0.5` for half a
     mistake.
   - Press **S** or click `+1` for a skipped question, **A** or `+0.5` for
     half a skipped question.
   - Use the `-0.5` buttons to correct a misclick. Counters never go below 0.
   - Toggle **Sent on time / late** and **Marked / not marked**.
   - Tick any relevant common notes.
7. The panel shows the live final mark, percentage, and understanding
   level as you go.
8. Click **Copy Report** to copy that student's WhatsApp-ready report.
9. Once you're done with a batch of students, open the popup's
   **Reports** section to review everyone at a glance, copy any report
   again, copy all reports at once, or copy the "Didn't Submit" summary
   for students in your list who have no record for this homework yet.

**Keyboard shortcuts only work while you're not typing** — they're
automatically ignored while your cursor is in a Classroom text field
(comment box, search box, etc.), so they won't interfere with normal use.

**Student auto-detection is best-effort.** Google Classroom's page
structure isn't a stable public API, so the extension tries to guess the
current student's name but always falls back to manual selection from your
student list if it can't. Always glance at the selected name before you
start recording.

## Development

This is plain HTML/CSS/JavaScript — no build step, no bundler, no
dependencies. Edit files under `src/` directly.

To pick up changes after editing:

1. Go to `chrome://extensions`.
2. Click the reload icon (⟳) on the Report Generator card.
3. Reload any open Google Classroom tab (content scripts don't auto-reload
   the page for you).

Your stored students/homeworks/reports persist across reloads — they only
go away if you remove the extension or manually clear its storage.

## Testing

### Automated (pure-function) checks

The calculation and report-template logic (`src/shared/calc.js`,
`src/shared/report.js`) has no DOM or storage dependency, so it's checked
with a small Node script (no test framework needed for a tool this size):

```bash
node test/run.js
```

This verifies the ceiling-rounding rule, the understanding-level
thresholds, and that generated report text matches the sample reports
byte-for-byte (including emoji placement and the automatic "not marked"
note).

### Manual checklist (in the actual extension)

floating panel, keyboard shortcuts, half-increments, student management,
report generation against the samples, the non-submission report, and the
highest-grade trophy tag.

## Project structure

```
manifest.json              Manifest V3 config
icons/                     Toolbar icons
src/
  shared/                  Pure logic + storage layer, shared by content
                            script and popup (constants, calc, report,
                            storage)
  background/              Minimal service worker (seeds default notes)
  content/                 Floating panel injected into Classroom pages
  popup/                   Student manager, homework sessions, reports
test/run.js                Node-based checks for calc.js / report.js
```
