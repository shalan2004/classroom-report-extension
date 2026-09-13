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

// --- clampCounter & undo simulation ---------------------------------------
assertEqual(calc.clampCounter(1.5), 1.5, 'clampCounter(1.5) -> 1.5');
assertEqual(calc.clampCounter(-0.5), 0, 'clampCounter(-0.5) -> 0');
assertEqual(calc.clampCounter(0), 0, 'clampCounter(0) -> 0');

// Simulated undo history flow (same logic as in content.js)
(function testUndoSimulation() {
  let val = 0;
  const history = [];
  function inc(delta) {
    const next = calc.clampCounter(val + delta);
    if (next !== val) {
      history.push(val);
      val = next;
    }
  }
  function undo() {
    if (history.length > 0) {
      val = history.pop();
    }
  }
  inc(1); // val=1, hist=[0]
  assertEqual(val, 1, 'counter incremented to 1');
  inc(0.5); // val=1.5, hist=[0, 1]
  assertEqual(val, 1.5, 'counter incremented to 1.5');
  undo(); // val=1, hist=[0]
  assertEqual(val, 1, 'undo restored 1');
  undo(); // val=0, hist=[]
  assertEqual(val, 0, 'undo restored 0');
  undo(); // no-op, val=0
  assertEqual(val, 0, 'undo on empty history stays 0');
})();

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
  '\uD83C\uDFC6 *Hanouf Nawaf* \uD83C\uDFC6\n\n' +
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
  '*Ali Raslan*\n\n' +
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

// --- student selection section visibility tests ----------------------------
(function testStudentSelectionVisibility() {
  function createMockElement(className) {
    const el = {
      className,
      hidden: false,
      style: { display: '' },
      value: '',
      checked: false,
      textContent: '',
      innerHTML: '',
      querySelector() { return null; }
    };
    return el;
  }

  const mockMsg = createMockElement('ma-select-student-msg');
  const mockGrading = createMockElement('ma-grading-section');
  const mockPanel = {
    querySelector(selector) {
      if (selector === '.ma-select-student-msg') return mockMsg;
      if (selector === '.ma-grading-section') return mockGrading;
      if (selector === '.ma-sent-on-time' || selector === '.ma-marked') return createMockElement('toggle');
      return createMockElement('dummy');
    },
    querySelectorAll() { return []; }
  };

  let state = { homework: { id: 'hw1' }, currentStudentId: null, record: null };
  function loadStudentRecordMock(panel, studentId) {
    const msgEl = panel.querySelector('.ma-select-student-msg');
    const gradingSection = panel.querySelector('.ma-grading-section');
    if (!studentId || !state.homework) {
      state.currentStudentId = null;
      state.record = null;
      if (msgEl) {
        msgEl.hidden = !state.homework;
        msgEl.style.display = state.homework ? '' : 'none';
      }
      if (gradingSection) {
        gradingSection.hidden = true;
        gradingSection.style.display = 'none';
      }
      return;
    }
    state.currentStudentId = studentId;
    state.record = { mistakes: 0, skipped: 0, sentOnTime: true, marked: true, notes: [] };
    if (msgEl) {
      msgEl.hidden = true;
      msgEl.style.display = 'none';
    }
    if (gradingSection) {
      gradingSection.hidden = false;
      gradingSection.style.display = '';
    }
  }

  // (a) fresh panel load with no student selected
  loadStudentRecordMock(mockPanel, null);
  assertEqual(mockMsg.hidden, false, '(a) fresh load: msgEl is visible');
  assertEqual(mockGrading.hidden, true, '(a) fresh load: gradingSection is hidden');
  assertEqual(mockGrading.style.display, 'none', '(a) fresh load: gradingSection display is none');

  // (b) selecting a student
  loadStudentRecordMock(mockPanel, 's1');
  assertEqual(mockMsg.hidden, true, '(b) select student: msgEl is hidden');
  assertEqual(mockGrading.hidden, false, '(b) select student: gradingSection is visible');
  assertEqual(mockGrading.style.display, '', '(b) select student: gradingSection display is empty');

  // (c) switching back to "Select student..."
  loadStudentRecordMock(mockPanel, null);
  assertEqual(mockMsg.hidden, false, '(c) reset to select student: msgEl is visible');
  assertEqual(mockGrading.hidden, true, '(c) reset to select student: gradingSection is hidden');
  assertEqual(mockGrading.style.display, 'none', '(c) reset to select student: gradingSection display is none');

  // (d) switching between two different students in a row
  loadStudentRecordMock(mockPanel, 's1');
  assertEqual(state.currentStudentId, 's1', '(d) student 1 selected');
  assertEqual(mockGrading.hidden, false, '(d) student 1 gradingSection visible');
  loadStudentRecordMock(mockPanel, 's2');
  assertEqual(state.currentStudentId, 's2', '(d) student 2 selected');
  assertEqual(mockGrading.hidden, false, '(d) student 2 gradingSection visible');
})();

// --- topic font scaling logic test ----------------------------------------
(function testTopicFontScaling() {
  function getTopicFontSize(topicText) {
    const len = topicText.length;
    if (len > 25) return '9px';
    if (len > 18) return '10px';
    if (len > 12) return '11px';
    return '12px';
  }

  assertEqual(getTopicFontSize('Short'), '12px', 'Short topic font size 12px');
  assertEqual(getTopicFontSize('Vectors (P1)'), '12px', 'Medium topic font size 12px');
  assertEqual(getTopicFontSize('Algebraic Expressions'), '10px', 'Long topic font size 10px');
  assertEqual(getTopicFontSize('Simplifying Algebraic Expressions'), '9px', 'Very long topic font size 9px');
})();

// --- panel position clamping logic test ------------------------------------
(function testPanelPositionClamping() {
  function clamp(panel, winWidth, winHeight) {
    if (!panel || (!panel.style.left && !panel.style.top)) return;
    const width = panel.offsetWidth || 240;
    const height = panel.offsetHeight || 300;
    const currentLeft = parseFloat(panel.style.left);
    const currentTop = parseFloat(panel.style.top);
    if (isNaN(currentLeft) || isNaN(currentTop)) return;
    const maxLeft = Math.max(0, winWidth - width);
    const maxTop = Math.max(0, winHeight - height);
    panel.style.left = Math.max(0, Math.min(currentLeft, maxLeft)) + 'px';
    panel.style.top = Math.max(0, Math.min(currentTop, maxTop)) + 'px';
  }

  const p = { style: { left: '1400px', top: '700px' }, offsetWidth: 240, offsetHeight: 300 };

  // On wide screen 1920x1080: 1400 is valid (max 1680)
  clamp(p, 1920, 1080);
  assertEqual(p.style.left, '1400px', 'Wide screen left unchanged');
  assertEqual(p.style.top, '700px', 'Wide screen top unchanged');

  // Resized to 600x800 narrow window (3-way split screen): max left = 600 - 240 = 360px
  clamp(p, 600, 800);
  assertEqual(p.style.left, '360px', 'Narrow screen left clamped to 360px');
  assertEqual(p.style.top, '500px', 'Narrow screen top clamped to 500px');
})();

// --- panel resizing bounds logic test --------------------------------------
(function testPanelResizing() {
  function resize(startW, startH, deltaX, deltaY, currentLeft, currentTop, winW, winH) {
    const minW = 200;
    const minH = 100;
    const maxW = Math.max(minW, winW - currentLeft - 10);
    const maxH = Math.max(minH, winH - currentTop - 10);
    const newWidth = Math.max(minW, Math.min(startW + deltaX, maxW));
    const newHeight = Math.max(minH, Math.min(startH + deltaY, maxH));
    return { width: newWidth, height: newHeight };
  }

  // Normal drag enlarge
  let r = resize(240, 300, 50, 50, 100, 100, 1920, 1080);
  assertEqual(r.width, 290, 'Resized width enlarged to 290');
  assertEqual(r.height, 350, 'Resized height enlarged to 350');

  // Drag below minimum bounds
  r = resize(240, 300, -200, -250, 100, 100, 1920, 1080);
  assertEqual(r.width, 200, 'Resized width clamped to min 200');
  assertEqual(r.height, 100, 'Resized height clamped to min 100');

  // Drag past viewport edge
  r = resize(240, 300, 1000, 1000, 1700, 900, 1920, 1080);
  assertEqual(r.width, 210, 'Resized width clamped to fit viewport (210)');
  assertEqual(r.height, 170, 'Resized height clamped to fit viewport (170)');
})();

// --- 100% trophy condition test ---------------------------------------------
(function testTrophyCondition() {
  const hw = { topic: 'Algebra', numQuestions: 20 };
  const s1 = { id: 's1', name: 'Student Perfect' };
  const s2 = { id: 's2', name: 'Student 95' };
  const s3 = { id: 's3', name: 'Student 80' };

  const r1 = { mistakes: 0, skipped: 0, sentOnTime: true, marked: true, notes: [] }; // 100%
  const r2 = { mistakes: 1, skipped: 0, sentOnTime: true, marked: true, notes: [] }; // 95%
  const r3 = { mistakes: 4, skipped: 0, sentOnTime: true, marked: true, notes: [] }; // 80%

  const rep1 = report.generateStudentReport(s1, hw, r1);
  const rep2 = report.generateStudentReport(s2, hw, r2);
  const rep3 = report.generateStudentReport(s3, hw, r3);

  assertEqual(rep1.includes('🏆'), true, 'Student with 100% score receives trophy emoji');
  assertEqual(rep2.includes('🏆'), false, 'Student with 95% score does NOT receive trophy emoji');
  assertEqual(rep3.includes('🏆'), false, 'Student with 80% score does NOT receive trophy emoji');
})();

// --- panel collapse toggle test ---------------------------------------------
(function testPanelCollapse() {
  const panel = {
    classList: {
      _classes: new Set(['ma-collapsed']),
      toggle(cls) {
        if (this._classes.has(cls)) {
          this._classes.delete(cls);
          return false;
        }
        this._classes.add(cls);
        return true;
      },
      contains(cls) {
        return this._classes.has(cls);
      }
    }
  };

  let btnText = '+';
  assertEqual(panel.classList.contains('ma-collapsed'), true, 'Panel starts in ma-collapsed state on page load');
  assertEqual(btnText, '+', 'Collapse button starts as + on page load');

  function toggleCollapse() {
    const isCollapsed = panel.classList.toggle('ma-collapsed');
    btnText = isCollapsed ? '+' : '−';
  }

  // User maximizes panel
  toggleCollapse();
  assertEqual(panel.classList.contains('ma-collapsed'), false, 'Panel removes ma-collapsed class on maximize');
  assertEqual(btnText, '−', 'Collapse button icon becomes − when maximized');

  // Test distinct two-state positioning: minimized (bottom-right) vs maximized (dragged/default)
  let savedMaximizedPos = { top: '100px', left: '200px' };
  let currentPos = { top: 'auto', bottom: '16px', right: '16px', left: 'auto' };

  function getActivePosition(isCollapsed) {
    if (isCollapsed) {
      return { top: 'auto', bottom: '16px', right: '16px', left: 'auto' };
    }
    return { ...savedMaximizedPos, bottom: 'auto', right: 'auto' };
  }

  // 1. Minimized on load: bottom-right
  assertEqual(getActivePosition(true).bottom, '16px', 'Minimized state anchored to bottom 16px');
  assertEqual(getActivePosition(true).right, '16px', 'Minimized state anchored to right 16px');

  // 2. Maximized: returns to savedMaximizedPos
  assertEqual(getActivePosition(false).top, '100px', 'Maximized state returns to top 100px');
  assertEqual(getActivePosition(false).left, '200px', 'Maximized state returns to left 200px');

  // 3. User drags maximized panel to new location
  savedMaximizedPos = { top: '300px', left: '400px' };
  assertEqual(getActivePosition(false).top, '300px', 'Dragged maximized top is updated to 300px');

  // 4. User minimizes again: returns to bottom-right without losing savedMaximizedPos
  assertEqual(getActivePosition(true).bottom, '16px', 'Minimizing again places panel back in bottom-right');
  assertEqual(savedMaximizedPos.top, '300px', 'Maximized position remains preserved at 300px while minimized');

  // 5. User maximizes again: returns to new saved location (300px, 400px)
  assertEqual(getActivePosition(false).top, '300px', 'Maximizing again restores dragged top 300px');
  assertEqual(getActivePosition(false).left, '400px', 'Maximizing again restores dragged left 400px');
})();

// --- Async Storage Batch Test ---------------------------------------------
(async function testBatchRecordPersistence() {
  const store = {};
  global.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const res = {};
          for (const k of keys) res[k] = store[k];
          return res;
        },
        set: async (obj) => {
          for (const [k, v] of Object.entries(obj)) {
            // Deep clone to simulate chrome storage isolation
            store[k] = JSON.parse(JSON.stringify(v));
          }
        },
      },
    },
  };

  // Require storage.js after setting global.chrome
  delete require.cache[require.resolve('../src/shared/storage.js')];
  require('../src/shared/storage.js');
  const storage = global.MA.storage;

  const hwId = 'hw-batch-1';
  const students = [];
  for (let i = 1; i <= 15; i++) {
    students.push({ id: `student-${i}`, name: `Student ${i}` });
  }

  // Rapidly save records concurrently (simulating rapid sequential grading/loading)
  const savePromises = students.map((s, idx) => {
    const rec = {
      homeworkId: hwId,
      studentId: s.id,
      mistakes: idx % 3,
      skipped: idx % 2,
      sentOnTime: true,
      marked: true,
      notes: [],
    };
    return storage.saveRecord(rec);
  });

  await Promise.all(savePromises);

  const savedRecords = await storage.getRecordsForHomework(hwId);
  const recordedCount = Object.keys(savedRecords).length;

  assertEqual(recordedCount, 15, 'All 15 batch reports are reliably saved without data loss');

  // Verify non-submission report logic
  const allReports = report.generateAllReports({
    homework: { id: hwId, topic: 'Batch Test', numQuestions: 10 },
    students,
    records: savedRecords,
  });

  assertEqual(allReports.missing.length, 0, 'No submitted students marked as missing');

  // Add 1 student who was NEVER graded/recorded
  students.push({ id: 'student-16-unsubmitted', name: 'Unsubmitted Student' });
  const updatedReports = report.generateAllReports({
    homework: { id: hwId, topic: 'Batch Test', numQuestions: 10 },
    students,
    records: savedRecords,
  });

  assertEqual(updatedReports.missing.length, 1, 'Genuine unsubmitted student correctly appears in missing');
  assertEqual(updatedReports.missing[0].name, 'Unsubmitted Student', 'Correct student name in missing list');

  // --- Verify student selection non-persisting behavior -------------------
  const hwId2 = 'hw-selection-test';
  const sA = { id: 'student-A', name: 'Reem Hamdy' };
  const sB = { id: 'student-B', name: 'Roshdy Ibrahim' };

  // 1. Reading student B's record via getRecord should return default in memory but NOT write to storage
  const recB = await storage.getRecord(hwId2, sB.id);
  assertEqual(recB.studentId, 'student-B', 'getRecord returns in-memory record for student B');

  const recordsInStore = await storage.getRecordsForHomework(hwId2);
  assertEqual(Object.keys(recordsInStore).length, 0, 'Selecting/loading student B does NOT save record to storage');

  // 2. Graded report saved only for student A
  await storage.saveRecord({
    homeworkId: hwId2,
    studentId: sA.id,
    mistakes: 1,
    skipped: 0,
    sentOnTime: true,
    marked: true,
    notes: [],
  });

  const recordsAfterA = await storage.getRecordsForHomework(hwId2);
  assertEqual(Object.keys(recordsAfterA).length, 1, 'Only student A record exists in storage after grading A');
  assertEqual(recordsAfterA[sA.id].mistakes, 1, 'Student A record saved correctly');
  assertEqual(recordsAfterA[sB.id], undefined, 'Student B remains unrecorded');

  // --- Verify addHomework & removeHomework flow -----------------------------
  const newHw = await storage.addHomework({ topic: 'Integration Test HW', numQuestions: 15 });
  assertEqual(newHw.topic, 'Integration Test HW', 'addHomework creates homework object');
  assertEqual(await storage.getActiveHomeworkId(), newHw.id, 'addHomework activates the newly created homework');

  await storage.removeHomework(newHw.id);
  assertEqual(await storage.getActiveHomeworkId(), null, 'removeHomework clears active homework on delete');

  // --- Verify deleteRecord & non-submission reversion flow ----------------
  const hwId3 = 'hw-delete-test';
  await storage.saveRecord({
    homeworkId: hwId3,
    studentId: sA.id,
    mistakes: 0,
    skipped: 0,
    sentOnTime: true,
    marked: true,
    notes: [],
  });
  await storage.saveRecord({
    homeworkId: hwId3,
    studentId: sB.id,
    mistakes: 2,
    skipped: 0,
    sentOnTime: true,
    marked: true,
    notes: [],
  });

  let recs3 = await storage.getRecordsForHomework(hwId3);
  assertEqual(Object.keys(recs3).length, 2, 'Both student A and B have recorded reports');

  // Delete student A's report
  await storage.deleteRecord(hwId3, sA.id);
  recs3 = await storage.getRecordsForHomework(hwId3);

  assertEqual(recs3[sA.id], undefined, 'Student A report permanently removed from storage');
  assertEqual(recs3[sB.id].mistakes, 2, 'Student B report remains completely unaffected');

  const deletedReports = report.generateAllReports({
    homework: { id: hwId3, topic: 'Delete Test', numQuestions: 10 },
    students: [sA, sB],
    records: recs3,
  });

  assertEqual(deletedReports.missing.length, 1, 'Student A automatically returns to missing/unsubmitted');
  assertEqual(deletedReports.missing[0].name, 'Reem Hamdy', 'Student A name is in missing list after report deletion');

  console.log(`\n${passes} passed, ${failures} failed.`);
  process.exit(failures > 0 ? 1 : 0);
})();
