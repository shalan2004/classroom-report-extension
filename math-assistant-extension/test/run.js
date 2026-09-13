// Lightweight test runner — no external framework, since this is a small
// local tool (plan.md section 10). Run with: node test/run.js
global.self = global;
require('../src/shared/constants.js');
require('../src/shared/calc.js');
require('../src/shared/report.js');

const MA = global.MA;
const { calc, report } = MA;

let failures = 0;
let passes = 0;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${label}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  } else {
    passes++;
  }
}

// --- ceilingRound -------------------------------------------------------
assertEqual(calc.ceilingRound(85.6), 86, 'ceilingRound 85.6 -> 86');
assertEqual(calc.ceilingRound(85.5), 86, 'ceilingRound 85.5 -> 86');
assertEqual(calc.ceilingRound(85.1), 86, 'ceilingRound 85.1 -> 86');
assertEqual(calc.ceilingRound(85.0), 85, 'ceilingRound 85.0 -> 85');

// --- percentage from the worked example (90 Qs, 5 mistakes, 5 skipped) --
assertEqual(calc.finalMark(90, 5, 5), 80, 'finalMark(90,5,5) -> 80');
assertEqual(calc.percentage(90, 5, 5), 89, 'percentage(90,5,5) -> ceil(88.888..) -> 89');

// --- understanding thresholds -------------------------------------------
assertEqual(calc.understandingLevel(100), 'Excellent', '100 -> Excellent');
assertEqual(calc.understandingLevel(85), 'Excellent', '85 -> Excellent');
assertEqual(calc.understandingLevel(84), 'V. Good', '84 -> V. Good');
assertEqual(calc.understandingLevel(75), 'V. Good', '75 -> V. Good');
assertEqual(calc.understandingLevel(70), 'Good', '70 -> Good');
assertEqual(calc.understandingLevel(65), 'Good', '65 -> Good');
assertEqual(calc.understandingLevel(56), 'Average', '56 -> Average');
assertEqual(calc.understandingLevel(50), 'Average', '50 -> Average');
assertEqual(calc.understandingLevel(46), 'Poor', '46 -> Poor');
assertEqual(calc.understandingLevel(0), 'Poor', '0 -> Poor');

// --- formatNumber ---------------------------------------------------------
assertEqual(calc.formatNumber(5), '5', 'formatNumber(5) -> "5"');
assertEqual(calc.formatNumber(2.5), '2.5', 'formatNumber(2.5) -> "2.5"');
assertEqual(calc.formatNumber(0), '0', 'formatNumber(0) -> "0"');

// --- report generation vs the exact provided samples ---------------------
const hanouf = { name: 'Hanouf Nawaf' };
const hanoufHw = { topic: 'Sketching the Curve (P3)', numQuestions: 100 };
const hanoufRecord = {
  mistakes: 0,
  skipped: 0,
  sentOnTime: true,
  marked: true,
  notes: [],
};
const expectedHanouf =
  '\uD83C\uDFC6 *Hanouf Nawaf* \uD83C\uDFC6\n' +
  '*\u2B55\uFE0FSketching the Curve (P3)\u2B55\uFE0F*\n' +
  '-HW sent on time\uD83D\uDFE2\n' +
  '-HW marked \uD83D\uDFE2\n' +
  '-Mistakes 0 \uD83D\uDFE2\n' +
  '-Skipped questions 0 \uD83D\uDFE2\n' +
  '-Understanding (Excellent \uD83D\uDC4F)\n' +
  '-Grade: *100%*';
assertEqual(
  report.generateStudentReport(hanouf, hanoufHw, hanoufRecord, { isHighest: true }),
  expectedHanouf,
  'Hanouf Nawaf sample report'
);

const ali = { name: 'Ali Raslan' };
// grade must come out to 70% — solve for numQuestions with mistakes=1, skipped=6
// 70% ceilingRound implies raw in (69, 70]. Using numQuestions=23: (23-1-6)/23*100 = 69.57 -> 70. Good.
const aliHw = { topic: 'Vectors (P1)', numQuestions: 23 };
const aliRecord = { mistakes: 1, skipped: 6, sentOnTime: true, marked: false, notes: [] };
const expectedAli =
  '*Ali Raslan*\n' +
  '*\u2B55\uFE0FVectors (P1)\u2B55\uFE0F*\n' +
  '-HW sent on time\uD83D\uDFE2\n' +
  '-HW NOT marked \uD83D\uDD34\n' +
  '-Mistakes 1 \uD83D\uDD34\n' +
  '-Skipped questions 6 \uD83D\uDD34\n' +
  '-Understanding (Good)\n' +
  '-Grade: *70%*\n\n' +
  MA.AUTO_NOT_MARKED_NOTE;
assertEqual(
  report.generateStudentReport(ali, aliHw, aliRecord, { isHighest: false }),
  expectedAli,
  'Ali Raslan sample report (with auto not-marked note)'
);

// --- non-submission report ---------------------------------------------
const vectorsHw = { topic: 'Vectors (P1)' };
const missing = [
  { name: 'Abdulaziz Aladib' },
  { name: 'Abdelwahab Eslam' },
  { name: 'Abdullah Jaber' },
  { name: 'Ali Elgendy' },
  { name: 'Hanouf Nawaf' },
  { name: 'Layan Hamdan' },
  { name: 'Malak Zahra' },
  { name: 'Mohamed Mazin' },
];
const expectedNonSubmission =
  '\u274C*Didn\u2019t send Vectors (P1) HW*\u274C\n' + missing.map((m) => m.name).join('\n');
assertEqual(
  report.generateNonSubmissionReport(vectorsHw, missing),
  expectedNonSubmission,
  'Non-submission report sample'
);

console.log(`\n${passes} passed, ${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);
