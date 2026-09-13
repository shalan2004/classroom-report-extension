# Report Generator Homework Reports — Implementation Plan

This file is the single source of truth for the project. Any time an
implementation decision changes a requirement or architecture choice made
here, this file must be updated in the same change.

## 1. Product Summary

A local, personal Chrome/Chromium **browser extension** (Manifest V3) that
speeds up grading homework inside Google Classroom. It is NOT a web app,
NOT a hosted service, and NOT a general school management platform.

Core loop:
```
Open student's homework in Google Classroom
  → floating panel is visible on the page
  → click / press M for a mistake, S for a skipped question
  → (n / a for half increments)
  → finish → confirm number of questions
  → extension computes final mark, percentage (ceiling rounding),
    understanding level
  → generate WhatsApp-ready report → copy to clipboard
  → paste into WhatsApp
```

Everything is stored locally via `chrome.storage.local`. No backend, no
accounts, no network calls.

## 2. Non-Goals (explicitly out of scope for v1)

- Automatic detection of mistakes / skipped questions from the submission.
- Automatic Classroom navigation between students.
- Automatic grading.
- Reading full submission content.
- Any backend, database, authentication, or cloud sync.
- A separate web app. The extension (content-script panel + popup) is the
  entire product.
- Multi-browser packaging beyond "should also work in Chromium/Edge because
  it uses standard Manifest V3 APIs" — no browser-specific code paths.

## 3. Architecture Overview

```
math-assistant-extension/
├── manifest.json                 Manifest V3 config
├── plan.md                       This file
├── README.md                     Install / dev / test instructions
├── icons/                        Extension icons
└── src/
    ├── shared/
    │   ├── constants.js          Shared enums/strings (emoji, thresholds)
    │   ├── calc.js                Pure calculation functions (marks, %, level)
    │   ├── report.js              Pure report-text generation (templates)
    │   └── storage.js             chrome.storage.local data access layer
    ├── background/
    │   └── background.js         Minimal service worker (install hooks only)
    ├── content/
    │   ├── content.js            Injected floating panel + shortcuts + logic
    │   └── content.css           Panel styling (scoped, non-intrusive)
    └── popup/
        ├── popup.html            Student manager + homework session manager
        ├── popup.js
        └── popup.css
```

### Why a floating content-script panel (not popup-only)?

Chrome extension popups close as soon as focus leaves them, which fails the
core requirement ("I should NOT need to open an extension popup every time
I want to record a mistake"). So the counters, shortcuts, and quick report
button live in a small floating panel injected directly into the Classroom
grading page via a content script. The toolbar **popup** is reserved for
less frequent tasks: managing the student list, setting up a homework
session (topic + question count + participating students), reviewing the
non-submission report, and reviewing/copying finished reports in bulk.

### Data flow

1. Popup is used to create/select a **Homework Session** (topic, number of
   questions) and to maintain the **Student list**.
2. The content script panel reads the *active homework session* from
   storage, lets the user pick/confirm the *current student* (see §6 —
   detection is best-effort with manual fallback), and records
   mistakes/skipped for that (session, student) pair directly to
   `chrome.storage.local`.
3. Calculations (`calc.js`) and report text generation (`report.js`) are
   pure functions shared by both the content script and the popup, so the
   quick "generate & copy" button in the panel and the full report review
   in the popup always produce identical output.
4. The popup's "All Reports" view reads every student's record for the
   active session, plus the full student list, to build the non-submission
   summary (students in the list with no record for this session).

## 4. Data Model (chrome.storage.local)

```js
// students: Student[]
Student = {
  id: string,          // uuid
  name: string,
}

// homeworks: Homework[]
Homework = {
  id: string,           // uuid
  topic: string,        // free text, exactly as it should appear in the
                         // report, e.g. "Sketching the Curve (P3)"
  numQuestions: number,
  createdAt: number,    // epoch ms
}

// records: keyed "<homeworkId>:<studentId>" -> Record
Record = {
  homeworkId: string,
  studentId: string,
  mistakes: number,     // multiple of 0.5, >= 0
  skipped: number,       // multiple of 0.5, >= 0
  sentOnTime: boolean,   // true = on time, false = late
  marked: boolean,       // true = marked, false = not marked
  notes: string[],       // ids of selected common notes (auto "not marked"
                         // note is NOT stored here — it is derived from
                         // `marked` at report-generation time)
  updatedAt: number,
}

// commonNotes: CommonNote[]  (user-extensible; ships with 3 defaults)
CommonNote = {
  id: string,
  text: string,          // exact multi-line WhatsApp text, stored verbatim
}

// activeHomeworkId: string | null   (last-selected session, for the panel)
```

All of this lives under a small number of top-level keys
(`students`, `homeworks`, `records`, `commonNotes`, `activeHomeworkId`) to
keep reads/writes simple — no external DB, no schema migrations framework
needed for a personal tool.

## 5. Calculation Logic (`shared/calc.js`)

```
finalMark   = numQuestions - mistakes - skipped
rawPercent  = (finalMark / numQuestions) * 100
percent     = ceilingRound(rawPercent)
```

`ceilingRound` = round *up* to the next whole number whenever there is any
decimal remainder; stays the same integer when the value is already whole.
This is **not** `Math.round`. To avoid floating point artifacts (e.g.
`88.88888888888889` vs a value that is mathematically an exact integer but
represented as `84.99999999999997`), the raw percentage is first rounded to
6 decimal places, then `Math.ceil` is applied:

```js
function ceilingRound(value) {
  const cleaned = Math.round(value * 1e6) / 1e6;
  return Math.ceil(cleaned);
}
```

Verified against the spec's examples: 85.6→86, 85.5→86, 85.1→86, 85.0→85.

Counters (mistakes/skipped) are always stored as multiples of 0.5 and are
clamped at a minimum of 0 (never negative). Display formatting drops the
`.0` for whole numbers (`5` not `5.0`) but keeps `.5` for halves (`2.5`).

## 6. Understanding Level (`shared/calc.js`)

Applied to the **rounded integer percentage**, exactly as specified:

| Percentage | Level      |
|-----------:|------------|
| ≥ 85       | Excellent  |
| ≥ 75       | Very Good  |
| ≥ 65       | Good       |
| ≥ 50       | Average    |
| < 50       | Poor       |

Excellent uses the exact sample emoji `👏` appended as `Excellent 👏`
(this is the "special dog-like symbol" referenced in the brief — the only
such symbol present in the provided samples is 👏, so that is what is
used; there is no separate paw/dog emoji in the samples).

**Documented discrepancy:** in the sample reports, "Bavely Wagdy" is shown
at 73% with understanding "V. Good", which falls in the 65–74% "Good"
band per the explicit rules in section 7 of the brief. Since the brief
says "use these exact rules" for classification and separately says to
copy exact *wording/formatting* from the samples, the numeric thresholds
above are implemented literally. This one sample data point is treated as
an inconsistency in the historical data, not as a rule to encode. If this
is wrong, update this section and `calc.js`'s `UNDERSTANDING_THRESHOLDS`.

## 7. Report Generation (`shared/report.js`)

Pure function `generateStudentReport(student, homework, record, {isHighest})`
returns the exact WhatsApp text. Template (each line reproduced exactly,
including spacing/emoji placement, as found in the provided samples):

```
🏆 *{name}* 🏆              ← only if isHighest, note the spaces around 🏆
*{name}*                    ← otherwise

*⭕️{topic}⭕️*
-HW sent on time🟢          ← if sentOnTime
-HW sent LATE🔴             ← if !sentOnTime
-HW marked 🟢               ← if marked
-HW NOT marked 🔴           ← if !marked
-Mistakes {n} 🟢            ← if mistakes == 0
-Mistakes {n} 🔴            ← if mistakes > 0
-Skipped questions {n} 🟢   ← if skipped == 0
-Skipped questions {n} 🔴   ← if skipped > 0
-Understanding ({level})    ← "(Excellent 👏)", "(V. Good)", "(Good)",
                               "(Average)", "(Poor)"
-Grade: *{percent}%*

*‼️NOTE‼️*
-{note text}‼️              ← auto note when !marked, then each selected
                               common note, each as its own block separated
                               by a blank line, in the order given in §13A
```

Note ordering: automatic "not marked" note first (if applicable), followed
by any manually selected common notes, in the order the user selected
them. Each note block is separated from the previous content by exactly
one blank line, matching the visual grouping style of the samples.

Non-submission summary — pure function `generateNonSubmissionReport(homework, missingStudents)`:

```
❌*Didn't send {topic} HW*❌
{student name}
{student name}
...
```

(Uses the exact apostrophe character `’` as in the sample: "Didn't".)

`generateAllReports(homework)` orchestrates: computes each participating
student's percentage, determines the highest grade, builds each student
report + the non-submission block, and returns an array of `{studentId,
text}` plus the non-submission text — used by the popup's bulk review UI.

### Highest grade / tie handling

The student(s) with the strictly highest **rounded percentage** for the
homework receive the 🏆 tag. If there is a tie for the highest percentage,
**all** tied students receive the 🏆 tag (simplest, safest interpretation —
no student is unfairly singled out, and no arbitrary tie-break is invented).
This is a documented assumption since the samples don't show a tie case.

## 8. Google Classroom Integration (`content/content.js`)

- `content_scripts` matches `https://classroom.google.com/*`.
- On page load (and on Classroom's internal SPA navigation, detected via a
  `MutationObserver` on `document.title` / URL polling since Classroom is a
  single-page app and doesn't do full page reloads), the script:
  1. Injects a small floating panel (defaults to bottom-right, draggable via header
     bar with viewport boundary clamping and position persisted to storage) if one
     isn't already present.
  2. Attempts a **best-effort** read of the currently displayed student's
     name from the Classroom DOM (common heading/selector patterns). This
     is wrapped in a try/catch and treated as unreliable — if it fails or
     the page structure doesn't match, the panel simply falls back to a
     manual student dropdown/search box populated from the local student
     list, with no error shown to the user. No complex automation, no
     retries, no fragile dependency on Classroom's internals for the
     extension to function.
  3. Loads the active homework session and, if one exists, the record for
     (session, detected/selected student), rendering current
     mistakes/skipped values.
- Global `keydown` listener attached in capture phase (`useCapture: true`) on `window`
  for `m` / Shift+`m` (Mistakes +1 / -1), `s` / Shift+`s` (Skipped +1 / -1), `n` (Mistakes +0.5), `a` (Skipped +0.5), and Comma (physical key `event.code === 'Comma'`, bound to Undo).
  To ensure shortcuts work when the teacher clicks inside embedded document viewers
  (e.g., Google Drive/Docs PDF or image preview iframes in Classroom), the content script
  is injected into all frames (`all_frames: true` matching `classroom.google.com`,
  `drive.google.com`, `docs.google.com`). Subframes capture keystrokes and forward shortcut
  events to the top window via `postMessage`. Ignored when `document.activeElement` (or any parent)
  is an `input`, `textarea`, `select`, or `isContentEditable === true` (e.g., Classroom comment boxes),
  and ignored when modifier keys (Ctrl/Cmd/Alt) are held.
- All counter mutations write straight to `chrome.storage.local` through
  `shared/storage.js`, clamped at 0, in steps of 0.5.
- Panel includes: student selector, and a prompt message ("Select a student to start grading")
  shown while no student is chosen. The grading controls section (mistakes/skipped counters with `-1`/`-0.5`/`+0.5`/`+1` buttons
  and directly editable number inputs that automatically clamp to >= 0 and snap to 0.5 steps, sent-on-time / marked toggles,
  live preview, common notes checkboxes, and "Copy Report" button) is hidden until a student is selected, and automatically reveals
  with that student's pre-filled values. Undo (Comma key `,`) and keyboard shortcuts (`m`/`s`/`n`/`a` / Shift+`m`/`s`) remain fully active via keyboard without cluttering the panel UI.

## 9. Popup (`popup/popup.html` + `popup.js`)

Four simple sections (stacked):

1. **Homework Session** — create new (topic, number of questions) or select
   an existing one as "active" (this is what the content-script panel reads
   from).
2. **Reports** — for the active homework: per-student status (recorded /
   not yet recorded), a "Copy" button per student, a "Copy All" convenience button,
   and the non-submission report with its own Copy button.
3. **Students** — add / rename / delete. Simple list with inline edit.
4. **Common Notes** — add / edit / delete user-extensible report notes.

## 10. Testing Plan

Since this is a personal tool with no backend, testing is manual +
lightweight pure-function checks:

- **Unit-style checks** for `calc.js` (`ceilingRound`, `finalMark`,
  `understandingLevel`) and `report.js` (template output byte-for-byte
  against the 6 provided samples plus the non-submission sample), run via a
  small Node script (`node test/run.js`) with no external test framework
  dependency, since this is a small local tool.
- **Manual extension test checklist** (documented in README):
  1. Load unpacked, confirm no console errors on `chrome://extensions`.
  2. Open a Classroom grading page, confirm panel appears.
  3. Confirm `m`/`s`/`n`/`a` update counters and are ignored while typing in
     a Classroom comment box.
  4. Confirm mouse `-0.5`/`+0.5`/`+1` controls work and never go negative.
  5. Enter number of questions, confirm mark/%/understanding update live.
  6. Add/edit/remove students in the popup; confirm the panel's student list
     updates.
  7. Generate a report for a student with 0 mistakes/0 skipped/marked/on
     time and diff it against the "Hanouf Nawaf" sample.
  8. Generate a report for a not-marked student and confirm the automatic
     note appears.
  9. Select common notes and confirm exact wording/formatting is preserved.
  10. Leave one student with no record, confirm they appear in the
      non-submission report with the exact sample format.
  11. Confirm the highest-scoring student gets the 🏆 tag.
  12. Reload the extension after a code change and confirm storage
      persists (data survives reload; only wiped if the user clears it).

## 11. Future Considerations (explicitly deferred, not built now)

- Reliable automatic student-name detection tuned to Classroom's actual DOM
  (currently best-effort/fallback only).
- Automatic detection of the current homework/assignment from the page.
- Additional keyboard shortcuts (e.g. next-student navigation).
- Export/import of student & report data (e.g. JSON backup).
- Firefox/other browser packaging.
- Richer report history/analytics.

## 12. Status

All sections above reflect the as-built v1. Any deviation discovered during
implementation is recorded here before or alongside the code change.
