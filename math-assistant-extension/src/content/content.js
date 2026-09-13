// Injects a small floating panel into Google Classroom grading pages so
// mistakes/skipped questions can be recorded without opening the popup.
// See plan.md section 8 for the design rationale.
(function () {
  const { calc, report, storage, EMOJI } = window.MA;

  const PANEL_ID = 'ma-panel-root';
  let state = null; // in-memory mirror of what's rendered, rebuilt on load

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  // --- Best-effort student name detection ---------------------------------
  // Google Classroom's DOM/class names change often and aren't a stable
  // public API. This is intentionally best-effort: if nothing matches, the
  // panel just falls back to manual selection (plan.md section 8/16).
  function detectStudentNameFromPage() {
    try {
      const candidates = [
        '[data-student-name]',
        'h1[role="heading"]',
        'h2[role="heading"]',
      ];
      for (const selector of candidates) {
        const el = document.querySelector(selector);
        if (el) {
          const text = (el.getAttribute('data-student-name') || el.textContent || '').trim();
          if (text && text.length < 60) return text;
        }
      }
    } catch (e) {
      // Swallow any DOM shape surprises — detection is optional.
    }
    return null;
  }

  // --- Panel construction ---------------------------------------------------
  function buildPanel() {
    const root = document.createElement('div');
    root.id = PANEL_ID;
    root.innerHTML = `
      <div class="ma-header">
        <span class="ma-title">Math Assistant</span>
        <button class="ma-collapse" title="Collapse/expand">&minus;</button>
      </div>
      <div class="ma-body">
        <div class="ma-row ma-no-homework" hidden>
          No active homework. Open the extension popup to create one.
        </div>
        <div class="ma-homework-info">
          <div class="ma-topic"></div>
          <div class="ma-row">
            <label>Questions</label>
            <input type="number" class="ma-num-questions" min="1" step="1" />
          </div>
        </div>
        <div class="ma-row">
          <label>Student</label>
          <select class="ma-student-select"></select>
        </div>

        <div class="ma-counter" data-field="mistakes">
          <label>Mistakes</label>
          <div class="ma-counter-controls">
            <button data-action="dec">-0.5</button>
            <span class="ma-counter-value">0</span>
            <button data-action="inc-half">+0.5</button>
            <button data-action="inc-one">+1</button>
          </div>
        </div>

        <div class="ma-counter" data-field="skipped">
          <label>Skipped</label>
          <div class="ma-counter-controls">
            <button data-action="dec">-0.5</button>
            <span class="ma-counter-value">0</span>
            <button data-action="inc-half">+0.5</button>
            <button data-action="inc-one">+1</button>
          </div>
        </div>

        <div class="ma-row ma-toggles">
          <label class="ma-toggle">
            <input type="checkbox" class="ma-sent-on-time" checked />
            Sent on time
          </label>
          <label class="ma-toggle">
            <input type="checkbox" class="ma-marked" checked />
            Marked
          </label>
        </div>

        <div class="ma-notes"></div>

        <div class="ma-preview">
          <div class="ma-preview-line ma-mark"></div>
          <div class="ma-preview-line ma-percent"></div>
          <div class="ma-preview-line ma-level"></div>
        </div>

        <div class="ma-row ma-shortcuts-hint">
          m / s = +1 &nbsp; n / a = +0.5
        </div>

        <button class="ma-copy-btn">Copy Report</button>
        <div class="ma-copied-msg" hidden>Copied!</div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function getPanel() {
    return document.getElementById(PANEL_ID) || buildPanel();
  }

  // --- Rendering --------------------------------------------------------
  async function refreshPreview(panel) {
    const { homework, record } = state;
    if (!homework) return;
    const mark = calc.finalMark(homework.numQuestions, record.mistakes, record.skipped);
    const pct = calc.percentage(homework.numQuestions, record.mistakes, record.skipped);
    const level = calc.understandingLevel(pct);
    panel.querySelector('.ma-mark').textContent = `Final mark: ${mark} / ${homework.numQuestions}`;
    panel.querySelector('.ma-percent').textContent = `Grade: ${pct}%`;
    panel.querySelector('.ma-level').textContent = `Understanding: ${level}${level === 'Excellent' ? ' ' + EMOJI.EXCELLENT : ''}`;
  }

  function renderCounter(panel, field, value) {
    const el = panel.querySelector(`.ma-counter[data-field="${field}"] .ma-counter-value`);
    el.textContent = calc.formatNumber(value);
  }

  async function renderNotes(panel) {
    const container = panel.querySelector('.ma-notes');
    const notes = await storage.getCommonNotes();
    container.innerHTML = notes
      .map(
        (n) => `
      <label class="ma-toggle ma-note-toggle">
        <input type="checkbox" class="ma-note-checkbox" data-note-id="${n.id}" ${
          state.record.notes.includes(n.id) ? 'checked' : ''
        } />
        ${n.text.split('\n')[1] ? n.text.split('\n')[1].replace(/^-/, '').replace(/[\u203C\uFE0F]/g, '').trim() : n.text}
      </label>`
      )
      .join('');
  }

  async function renderStudentSelect(panel) {
    const select = panel.querySelector('.ma-student-select');
    const students = await storage.getStudents();
    const detectedName = detectStudentNameFromPage();

    select.innerHTML =
      '<option value="">Select student…</option>' +
      students.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

    let selectedId = state.currentStudentId;
    if (!selectedId && detectedName) {
      const match = students.find(
        (s) => s.name.trim().toLowerCase() === detectedName.trim().toLowerCase()
      );
      if (match) selectedId = match.id;
    }
    if (selectedId) select.value = selectedId;
  }

  async function loadStudentRecord(panel, studentId) {
    if (!studentId || !state.homework) {
      state.currentStudentId = null;
      state.record = null;
      return;
    }
    state.currentStudentId = studentId;
    state.record = await storage.getRecord(state.homework.id, studentId);
    renderCounter(panel, 'mistakes', state.record.mistakes);
    renderCounter(panel, 'skipped', state.record.skipped);
    panel.querySelector('.ma-sent-on-time').checked = state.record.sentOnTime;
    panel.querySelector('.ma-marked').checked = state.record.marked;
    await renderNotes(panel);
    await refreshPreview(panel);
  }

  async function loadActiveHomework(panel) {
    const activeId = await storage.getActiveHomeworkId();
    const homeworks = await storage.getHomeworks();
    state.homework = homeworks.find((h) => h.id === activeId) || null;

    const noHomeworkEl = panel.querySelector('.ma-no-homework');
    const infoEl = panel.querySelector('.ma-homework-info');
    if (!state.homework) {
      noHomeworkEl.hidden = false;
      infoEl.hidden = true;
      panel.querySelector('.ma-student-select').innerHTML = '';
      return;
    }
    noHomeworkEl.hidden = true;
    infoEl.hidden = false;
    panel.querySelector('.ma-topic').textContent = state.homework.topic;
    panel.querySelector('.ma-num-questions').value = state.homework.numQuestions;

    await renderStudentSelect(panel);
    const select = panel.querySelector('.ma-student-select');
    await loadStudentRecord(panel, select.value || null);
  }

  // --- Mutations ----------------------------------------------------------
  async function mutateCounter(panel, field, delta) {
    if (!state.record) return;
    const next = calc.clampCounter(state.record[field] + delta);
    state.record[field] = next;
    renderCounter(panel, field, next);
    await refreshPreview(panel);
    await storage.saveRecord(state.record);
  }

  async function toggleField(panel, field, value) {
    if (!state.record) return;
    state.record[field] = value;
    await storage.saveRecord(state.record);
  }

  async function toggleNote(panel, noteId, checked) {
    if (!state.record) return;
    const set = new Set(state.record.notes);
    if (checked) set.add(noteId);
    else set.delete(noteId);
    state.record.notes = Array.from(set);
    await storage.saveRecord(state.record);
  }

  async function copyReport(panel) {
    if (!state.homework || !state.currentStudentId) return;
    const students = await storage.getStudents();
    const student = students.find((s) => s.id === state.currentStudentId);
    if (!student) return;

    const allNotes = await storage.getCommonNotes();
    const notesById = Object.fromEntries(allNotes.map((n) => [n.id, n]));
    const selectedNotes = state.record.notes.map((id) => notesById[id]).filter(Boolean);

    // Determine highest grade across everyone recorded for this homework
    // so the trophy tag is accurate even from the quick panel.
    const records = await storage.getRecordsForHomework(state.homework.id);
    let highestPct = -Infinity;
    for (const rec of Object.values(records)) {
      const pct = calc.percentage(state.homework.numQuestions, rec.mistakes, rec.skipped);
      if (pct > highestPct) highestPct = pct;
    }
    const myPct = calc.percentage(
      state.homework.numQuestions,
      state.record.mistakes,
      state.record.skipped
    );

    const text = report.generateStudentReport(student, state.homework, state.record, {
      isHighest: myPct === highestPct,
      commonNotes: selectedNotes,
    });

    await navigator.clipboard.writeText(text);
    const msg = panel.querySelector('.ma-copied-msg');
    msg.hidden = false;
    setTimeout(() => (msg.hidden = true), 1500);
  }

  // --- Event wiring -------------------------------------------------------
  function wireEvents(panel) {
    panel.querySelector('.ma-collapse').addEventListener('click', () => {
      panel.classList.toggle('ma-collapsed');
    });

    panel.querySelector('.ma-student-select').addEventListener('change', (e) => {
      loadStudentRecord(panel, e.target.value || null);
    });

    panel.querySelector('.ma-num-questions').addEventListener('change', async (e) => {
      if (!state.homework) return;
      const value = Math.max(1, Number(e.target.value) || 1);
      state.homework.numQuestions = value;
      await storage.updateHomework(state.homework.id, { numQuestions: value });
      await refreshPreview(panel);
    });

    panel.querySelectorAll('.ma-counter').forEach((counterEl) => {
      const field = counterEl.dataset.field;
      counterEl.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const delta = action === 'dec' ? -0.5 : action === 'inc-half' ? 0.5 : 1;
          mutateCounter(panel, field, delta);
        });
      });
    });

    panel.querySelector('.ma-sent-on-time').addEventListener('change', (e) => {
      toggleField(panel, 'sentOnTime', e.target.checked);
    });
    panel.querySelector('.ma-marked').addEventListener('change', (e) => {
      toggleField(panel, 'marked', e.target.checked);
    });

    panel.querySelector('.ma-notes').addEventListener('change', (e) => {
      if (e.target.classList.contains('ma-note-checkbox')) {
        toggleNote(panel, e.target.dataset.noteId, e.target.checked);
      }
    });

    panel.querySelector('.ma-copy-btn').addEventListener('click', () => copyReport(panel));

    document.addEventListener('keydown', (e) => {
      if (isTypingTarget(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!state || !state.record) return;

      const key = e.key.toLowerCase();
      if (key === 'm') mutateCounter(panel, 'mistakes', 1);
      else if (key === 's') mutateCounter(panel, 'skipped', 1);
      else if (key === 'n') mutateCounter(panel, 'mistakes', 0.5);
      else if (key === 'a') mutateCounter(panel, 'skipped', 0.5);
      else return;
      e.preventDefault();
    });
  }

  // --- Storage change sync (e.g. edits made from the popup) -----------------
  function wireStorageSync(panel) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (
        changes.students ||
        changes.homeworks ||
        changes.activeHomeworkId ||
        changes.commonNotes
      ) {
        loadActiveHomework(panel);
      }
    });
  }

  // --- SPA navigation watcher ------------------------------------------
  // Classroom doesn't do full page reloads between students/assignments,
  // so watch for URL changes to keep the panel/student selection in sync.
  function watchNavigation(panel) {
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        renderStudentSelect(panel).then(() => {
          const select = panel.querySelector('.ma-student-select');
          loadStudentRecord(panel, select.value || null);
        });
      }
    }, 1000);
  }

  async function init() {
    if (document.getElementById(PANEL_ID)) return;
    state = { homework: null, record: null, currentStudentId: null };
    const panel = getPanel();
    wireEvents(panel);
    wireStorageSync(panel);
    watchNavigation(panel);
    await loadActiveHomework(panel);
  }

  init();
})();
