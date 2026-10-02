// Injects a small floating panel into Google Classroom grading pages so
// mistakes/skipped questions can be recorded without opening the popup.
// See plan.md section 8 for the design rationale.
(function () {
  const { calc, report, storage, EMOJI } = window.MA;

  const PANEL_ID = 'ma-panel-root';
  let state = null; // in-memory mirror of what's rendered, rebuilt on load
  const undoHistory = []; // in-memory stack for undoing counter changes (max 5)

  function isTypingTarget(el) {
    let curr = el;
    while (curr) {
      if (curr.isContentEditable) return true;
      const tag = curr.tagName ? curr.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      curr = curr.parentElement;
    }
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
    root.className = 'ma-collapsed';
    root.innerHTML = `
      <div class="ma-header">
        <span class="ma-title">Report Generator</span>
        <button class="ma-collapse" title="Collapse/expand">+</button>
      </div>
      <div class="ma-body">
        <div class="ma-homework-info">
          <div class="ma-topic-row">
            <span class="ma-topic-emoji">⭕️</span>
            <span class="ma-topic"></span>
            <span class="ma-topic-emoji">⭕️</span>
            <div class="ma-qs-wrap">
              <label>Qs</label>
              <input type="number" class="ma-num-questions" min="1" step="1" title="Number of questions" />
            </div>
          </div>
        </div>
        <div class="ma-row">
          <label>Student</label>
          <select class="ma-student-select"></select>
        </div>

        <div class="ma-select-student-msg">Select a student to start grading</div>

        <div class="ma-grading-section" hidden>
          <div class="ma-segmented-group">
            <div class="ma-segmented-control" data-field="sentOnTime">
              <button type="button" class="ma-seg-btn ma-seg-ontime" data-value="true">On time 🟢</button>
              <button type="button" class="ma-seg-btn ma-seg-late" data-value="false">Late 🔴</button>
            </div>
            <div class="ma-segmented-control" data-field="marked">
              <button type="button" class="ma-seg-btn ma-seg-marked" data-value="true">Marked 🟢</button>
              <button type="button" class="ma-seg-btn ma-seg-notmarked" data-value="false">Not marked 🔴</button>
            </div>
          </div>

          <div class="ma-counter" data-field="mistakes">
            <label>Mistakes</label>
            <div class="ma-counter-controls">
              <button data-action="dec-one">-1</button>
              <button data-action="dec">-0.5</button>
              <input type="number" class="ma-counter-value" min="0" step="0.5" value="0" />
              <button data-action="inc-half">+0.5</button>
              <button data-action="inc-one">+1</button>
            </div>
          </div>

          <div class="ma-counter" data-field="skipped">
            <label>Skipped</label>
            <div class="ma-counter-controls">
              <button data-action="dec-one">-1</button>
              <button data-action="dec">-0.5</button>
              <input type="number" class="ma-counter-value" min="0" step="0.5" value="0" />
              <button data-action="inc-half">+0.5</button>
              <button data-action="inc-one">+1</button>
            </div>
          </div>

          <div class="ma-preview">
            <div class="ma-preview-line ma-mark"></div>
            <div class="ma-preview-line ma-percent"></div>
            <div class="ma-preview-line ma-level"></div>
          </div>

          <div class="ma-notes-section">
            <button type="button" class="ma-notes-toggle-btn">
              <span>Add Note?</span>
              <span class="ma-notes-arrow">▶</span>
            </button>
            <div class="ma-notes" hidden></div>
          </div>

          <button class="ma-copy-btn">Copy Report</button>
          <div class="ma-copied-msg" hidden>Copied!</div>
        </div>
      </div>
      <div class="ma-resize-handle" title="Resize panel"></div>
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
    if (el) {
      el.value = calc.formatNumber(value);
    }
  }

  function renderSegmentedToggles(panel) {
    if (!state.record) return;
    const sentOnTimeControl = panel.querySelector('.ma-segmented-control[data-field="sentOnTime"]');
    if (sentOnTimeControl) {
      const onTimeBtn = sentOnTimeControl.querySelector('.ma-seg-ontime');
      const lateBtn = sentOnTimeControl.querySelector('.ma-seg-late');
      if (state.record.sentOnTime) {
        onTimeBtn.classList.add('active');
        lateBtn.classList.remove('active');
      } else {
        onTimeBtn.classList.remove('active');
        lateBtn.classList.add('active');
      }
    }

    const markedControl = panel.querySelector('.ma-segmented-control[data-field="marked"]');
    if (markedControl) {
      const markedBtn = markedControl.querySelector('.ma-seg-marked');
      const notMarkedBtn = markedControl.querySelector('.ma-seg-notmarked');
      if (state.record.marked) {
        markedBtn.classList.add('active');
        notMarkedBtn.classList.remove('active');
      } else {
        markedBtn.classList.remove('active');
        notMarkedBtn.classList.add('active');
      }
    }
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
    if (!select) return;
    const students = await storage.getStudents();
    const detectedName = detectStudentNameFromPage();

    let records = {};
    if (state.homework) {
      records = await storage.getRecordsForHomework(state.homework.id);
    }

    const currentVal = select.value;
    select.innerHTML =
      '<option value="">Select student…</option>' +
      students
        .map((s) => {
          const rec = records[s.id];
          let trophyPrefix = '';
          if (rec && state.homework) {
            const pct = calc.percentage(
              state.homework.numQuestions,
              rec.mistakes || 0,
              rec.skipped || 0
            );
            if (pct === 100) {
              trophyPrefix = `${EMOJI.TROPHY} `;
            }
          }
          return `<option value="${s.id}">${trophyPrefix}${s.name}</option>`;
        })
        .join('');

    let selectedId = state.currentStudentId || currentVal;
    if (!selectedId && detectedName) {
      const match = students.find(
        (s) => s.name.trim().toLowerCase() === detectedName.trim().toLowerCase()
      );
      if (match) selectedId = match.id;
    }
    if (selectedId) select.value = selectedId;
  }

  let currentLoadSeq = 0;

  async function loadStudentRecord(panel, studentId) {
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

    const seq = ++currentLoadSeq;
    const homeworkId = state.homework.id;
    state.currentStudentId = studentId;

    const rec = await storage.getRecord(homeworkId, studentId);
    if (seq !== currentLoadSeq || state.currentStudentId !== studentId) {
      return;
    }

    state.record = rec;

    if (msgEl) {
      msgEl.hidden = true;
      msgEl.style.display = 'none';
    }
    if (gradingSection) {
      gradingSection.hidden = false;
      gradingSection.style.display = '';
    }

    renderCounter(panel, 'mistakes', state.record.mistakes);
    renderCounter(panel, 'skipped', state.record.skipped);
    renderSegmentedToggles(panel);

    const notesContainer = panel.querySelector('.ma-notes');
    const notesArrow = panel.querySelector('.ma-notes-arrow');
    if (notesContainer) {
      notesContainer.hidden = true;
      notesContainer.style.display = 'none';
    }
    if (notesArrow) {
      notesArrow.textContent = '▶';
    }

    await renderNotes(panel);
    await refreshPreview(panel);
    await renderStudentSelect(panel);
    clampPanelPosition(panel);
  }

  async function loadActiveHomework(panel) {
    const activeId = await storage.getActiveHomeworkId();
    const homeworks = await storage.getHomeworks();
    state.homework = homeworks.find((h) => h.id === activeId) || null;

    const bodyEl = panel.querySelector('.ma-body');
    const infoEl = panel.querySelector('.ma-homework-info');
    const msgEl = panel.querySelector('.ma-select-student-msg');
    const gradingSection = panel.querySelector('.ma-grading-section');

    if (!state.homework) {
      state.currentStudentId = null;
      state.record = null;
      if (bodyEl) bodyEl.hidden = true;
      if (infoEl) infoEl.hidden = true;
      if (msgEl) {
        msgEl.hidden = true;
        msgEl.style.display = 'none';
      }
      if (gradingSection) {
        gradingSection.hidden = true;
        gradingSection.style.display = 'none';
      }
      panel.querySelector('.ma-student-select').innerHTML = '';
      clampPanelPosition(panel);
      return;
    }
    if (bodyEl) bodyEl.hidden = false;
    infoEl.hidden = false;
    const topicEl = panel.querySelector('.ma-topic');
    const topicText = state.homework.topic || '';
    topicEl.textContent = topicText;
    const len = topicText.length;
    if (len > 25) {
      topicEl.style.fontSize = '9px';
    } else if (len > 18) {
      topicEl.style.fontSize = '10px';
    } else if (len > 12) {
      topicEl.style.fontSize = '11px';
    } else {
      topicEl.style.fontSize = '12px';
    }

    panel.querySelector('.ma-num-questions').value = state.homework.numQuestions;

    await renderStudentSelect(panel);
    const select = panel.querySelector('.ma-student-select');
    await loadStudentRecord(panel, select.value || null);
    clampPanelPosition(panel);
  }

  // --- Mutations ----------------------------------------------------------
  async function mutateCounter(panel, field, delta) {
    if (!state.record || !state.currentStudentId || !state.homework) return;
    if (state.record.studentId !== state.currentStudentId || state.record.homeworkId !== state.homework.id) return;

    const prevValue = state.record[field];
    const next = calc.clampCounter(prevValue + delta);
    if (next === prevValue) return;

    undoHistory.push({
      studentId: state.currentStudentId,
      field,
      prevValue,
    });
    if (undoHistory.length > 5) undoHistory.shift();

    state.record[field] = next;
    renderCounter(panel, field, next);
    await refreshPreview(panel);
    state.record = await storage.saveRecord(state.record);
    await renderStudentSelect(panel);
  }

  async function setCounterDirect(panel, field, rawValue) {
    if (!state.record || !state.currentStudentId || !state.homework) return;
    if (state.record.studentId !== state.currentStudentId || state.record.homeworkId !== state.homework.id) return;

    const num = Number(rawValue);
    const prevValue = state.record[field];
    const next = calc.clampCounter(isNaN(num) ? 0 : num);

    renderCounter(panel, field, next);
    if (next === prevValue) return;

    undoHistory.push({
      studentId: state.currentStudentId,
      field,
      prevValue,
    });
    if (undoHistory.length > 5) undoHistory.shift();

    state.record[field] = next;
    await refreshPreview(panel);
    state.record = await storage.saveRecord(state.record);
    await renderStudentSelect(panel);
  }

  async function undoLastAction(panel) {
    if (!state || !state.record || !state.currentStudentId || !state.homework) return;
    if (state.record.studentId !== state.currentStudentId || state.record.homeworkId !== state.homework.id) return;

    for (let i = undoHistory.length - 1; i >= 0; i--) {
      if (undoHistory[i].studentId === state.currentStudentId) {
        const action = undoHistory.splice(i, 1)[0];
        state.record[action.field] = action.prevValue;
        renderCounter(panel, action.field, action.prevValue);
        await refreshPreview(panel);
        state.record = await storage.saveRecord(state.record);
        await renderStudentSelect(panel);
        break;
      }
    }
  }

  async function toggleField(panel, field, value) {
    if (!state.record || !state.currentStudentId || !state.homework) return;
    if (state.record.studentId !== state.currentStudentId || state.record.homeworkId !== state.homework.id) return;

    state.record[field] = value;
    state.record = await storage.saveRecord(state.record);
  }

  async function toggleNote(panel, noteId, checked) {
    if (!state.record || !state.currentStudentId || !state.homework) return;
    if (state.record.studentId !== state.currentStudentId || state.record.homeworkId !== state.homework.id) return;

    const set = new Set(state.record.notes || []);
    if (checked) set.add(noteId);
    else set.delete(noteId);
    state.record.notes = Array.from(set);
    state.record = await storage.saveRecord(state.record);
  }

  async function copyReport(panel) {
    if (!state.homework || !state.currentStudentId || !state.record) return;
    if (state.record.studentId !== state.currentStudentId || state.record.homeworkId !== state.homework.id) return;

    // Explicitly persist record before copying text
    state.record = await storage.saveRecord(state.record);

    const students = await storage.getStudents();
    const student = students.find((s) => s.id === state.currentStudentId);
    if (!student) return;

    const allNotes = await storage.getCommonNotes();
    const notesById = Object.fromEntries(allNotes.map((n) => [n.id, n]));
    const selectedNotes = (state.record.notes || []).map((id) => notesById[id]).filter(Boolean);

    const text = report.generateStudentReport(student, state.homework, state.record, {
      commonNotes: selectedNotes,
    });

    await navigator.clipboard.writeText(text);
    const msg = panel.querySelector('.ma-copied-msg');
    if (msg) {
      msg.hidden = false;
      setTimeout(() => (msg.hidden = true), 1500);
    }
    await renderStudentSelect(panel);
  }

  // --- Event wiring -------------------------------------------------------
  function wireEvents(panel) {
    const collapseBtn = panel.querySelector('.ma-collapse');
    collapseBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('ma-collapsed');
      collapseBtn.innerHTML = isCollapsed ? '+' : '&minus;';
      if (!isCollapsed) {
        clampPanelPosition(panel);
      }
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
          const delta =
            action === 'dec-one' ? -1 : action === 'dec' ? -0.5 : action === 'inc-half' ? 0.5 : 1;
          mutateCounter(panel, field, delta);
        });
      });
      const inputEl = counterEl.querySelector('.ma-counter-value');
      if (inputEl) {
        inputEl.addEventListener('change', (e) => {
          setCounterDirect(panel, field, e.target.value);
        });
      }
    });

    panel.querySelectorAll('.ma-segmented-control').forEach((ctrl) => {
      const field = ctrl.dataset.field;
      ctrl.querySelectorAll('.ma-seg-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const val = btn.dataset.value === 'true';
          await toggleField(panel, field, val);
          renderSegmentedToggles(panel);
        });
      });
    });

    const notesToggleBtn = panel.querySelector('.ma-notes-toggle-btn');
    const notesContainer = panel.querySelector('.ma-notes');
    const notesArrow = panel.querySelector('.ma-notes-arrow');

    if (notesToggleBtn && notesContainer) {
      notesToggleBtn.addEventListener('click', () => {
        const isHidden = notesContainer.hidden;
        notesContainer.hidden = !isHidden;
        notesContainer.style.display = isHidden ? 'flex' : 'none';
        if (notesArrow) {
          notesArrow.textContent = isHidden ? '▼' : '▶';
        }
      });
    }

    panel.querySelector('.ma-notes').addEventListener('change', (e) => {
      if (e.target.classList.contains('ma-note-checkbox')) {
        toggleNote(panel, e.target.dataset.noteId, e.target.checked);
      }
    });

    panel.querySelector('.ma-copy-btn').addEventListener('click', () => copyReport(panel));

    window.addEventListener(
      'keydown',
      (e) => {
        if (isTypingTarget(document.activeElement)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!state || !state.record) return;

        const key = (e.key || '').toLowerCase();
        if (e.code === 'Comma' || key === 'm' || key === 's' || key === 'n' || key === 'a') {
          dispatchShortcut(panel, e.code, key, e.shiftKey);
          e.preventDefault();
        }
      },
      true
    );
  }

  function dispatchShortcut(panel, code, key, shiftKey) {
    if (!state || !state.record) return;
    if (code === 'Comma') {
      undoLastAction(panel);
      return;
    }
    const k = (key || '').toLowerCase();
    if (k === 'm') mutateCounter(panel, 'mistakes', shiftKey ? -1 : 1);
    else if (k === 's') mutateCounter(panel, 'skipped', shiftKey ? -1 : 1);
    else if (k === 'n') mutateCounter(panel, 'mistakes', 0.5);
    else if (k === 'a') mutateCounter(panel, 'skipped', 0.5);
  }

  function handleIframeKeyDown(e) {
    if (isTypingTarget(document.activeElement)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = (e.key || '').toLowerCase();
    if (e.code === 'Comma' || key === 'm' || key === 's' || key === 'n' || key === 'a') {
      e.preventDefault();
      try {
        window.top.postMessage(
          {
            type: 'MA_KEYBOARD_SHORTCUT',
            code: e.code,
            key: e.key,
            shiftKey: e.shiftKey,
          },
          '*'
        );
      } catch (err) {
        // Swallow postMessage errors if window.top is unreachable
      }
    }
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

  // --- Draggable panel ----------------------------------------------------
  function makeDraggable(panel) {
    const header = panel.querySelector('.ma-header');
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, select, input')) return;
      if (panel.classList.contains('ma-collapsed')) return;

      isDragging = true;
      header.style.cursor = 'grabbing';

      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = initialLeft + 'px';
      panel.style.top = initialTop + 'px';

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const rect = panel.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      const maxLeft = Math.max(0, window.innerWidth - width);
      const maxTop = Math.max(0, window.innerHeight - height);

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      header.style.cursor = 'grab';

      const rect = panel.getBoundingClientRect();
      try {
        chrome.storage.local.set({
          panelPosition: { top: rect.top, left: rect.left },
        });
      } catch (err) {
        // Storage unavailable
      }
    });
  }

  function clampPanelPosition(panel) {
    if (!panel) return;
    if (panel.classList.contains('ma-collapsed')) return;
    if (!panel.style.left && !panel.style.top) return;

    const rect = panel.getBoundingClientRect();
    const width = panel.offsetWidth || rect.width || 240;
    const height = panel.offsetHeight || rect.height || 200;

    const currentLeft = parseFloat(panel.style.left);
    const currentTop = parseFloat(panel.style.top);

    if (isNaN(currentLeft) || isNaN(currentTop)) return;

    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);

    const clampedLeft = Math.max(0, Math.min(currentLeft, maxLeft));
    const clampedTop = Math.max(0, Math.min(currentTop, maxTop));

    panel.style.left = clampedLeft + 'px';
    panel.style.top = clampedTop + 'px';
  }

  async function restorePanelPosition(panel) {
    try {
      const data = await chrome.storage.local.get(['panelPosition']);
      if (data && data.panelPosition) {
        const { top, left } = data.panelPosition;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        clampPanelPosition(panel);
      }
    } catch (err) {
      // Ignore storage errors
    }
  }

  // --- Resizable panel ----------------------------------------------------
  function makeResizable(panel) {
    const handle = panel.querySelector('.ma-resize-handle');
    if (!handle) return;

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startWidth = rect.width;
      startHeight = rect.height;

      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const rect = panel.getBoundingClientRect();
      const currentLeft = rect.left;
      const currentTop = rect.top;

      const minW = 200;
      const minH = 100;
      const maxW = Math.max(minW, window.innerWidth - currentLeft - 10);
      const maxH = Math.max(minH, window.innerHeight - currentTop - 10);

      const newWidth = Math.max(minW, Math.min(startWidth + deltaX, maxW));
      const newHeight = Math.max(minH, Math.min(startHeight + deltaY, maxH));

      panel.style.width = newWidth + 'px';
      panel.style.height = newHeight + 'px';
      panel.style.maxHeight = 'none';
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;

      const rect = panel.getBoundingClientRect();
      try {
        chrome.storage.local.set({
          panelSize: { width: Math.round(rect.width), height: Math.round(rect.height) },
        });
      } catch (err) {
        // Storage unavailable
      }
    });
  }

  async function restorePanelSize(panel) {
    try {
      const data = await chrome.storage.local.get(['panelSize']);
      if (data && data.panelSize) {
        const { width, height } = data.panelSize;
        if (width && width >= 200) {
          const maxW = Math.max(200, window.innerWidth - 16);
          panel.style.width = Math.min(width, maxW) + 'px';
        }
        if (height && height >= 100) {
          const maxH = Math.max(100, window.innerHeight - 16);
          panel.style.height = Math.min(height, maxH) + 'px';
          panel.style.maxHeight = 'none';
        }
      }
    } catch (err) {
      // Ignore storage errors
    }
  }

  async function init() {
    const isTopFrame = window.self === window.top;

    if (!isTopFrame) {
      // In subframes (e.g. Google Drive/Docs PDF/image viewer inside Classroom),
      // forward keydown shortcuts to the top window via postMessage.
      window.addEventListener('keydown', handleIframeKeyDown, true);
      return;
    }

    if (document.getElementById(PANEL_ID)) return;
    state = { homework: null, record: null, currentStudentId: null };
    const panel = getPanel();
    makeDraggable(panel);
    makeResizable(panel);
    await restorePanelSize(panel);
    wireEvents(panel);
    wireStorageSync(panel);
    watchNavigation(panel);
    await loadActiveHomework(panel);

    window.addEventListener('resize', () => {
      const panelEl = getPanel();
      if (panelEl) clampPanelPosition(panelEl);
    });

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'MA_KEYBOARD_SHORTCUT') {
        const panelEl = getPanel();
        dispatchShortcut(panelEl, e.data.code, e.data.key, e.data.shiftKey);
      }
    });
  }

  init();
})();
