(function () {
  const { calc, report, storage } = window.MA;

  const els = {
    homeworkSelect: document.getElementById('homework-select'),
    deleteHomeworkBtn: document.getElementById('delete-homework-btn'),
    newTopic: document.getElementById('new-homework-topic'),
    newQuestions: document.getElementById('new-homework-questions'),
    createHomeworkBtn: document.getElementById('create-homework-btn'),

    newStudentName: document.getElementById('new-student-name'),
    addStudentBtn: document.getElementById('add-student-btn'),
    studentList: document.getElementById('student-list'),

    commonNotesList: document.getElementById('common-notes-list'),
    newNoteText: document.getElementById('new-note-text'),
    addNoteBtn: document.getElementById('add-note-btn'),

    reportsEmpty: document.getElementById('reports-empty'),
    reportsBody: document.getElementById('reports-body'),
    reportsList: document.getElementById('reports-list'),
    copyAllBtn: document.getElementById('copy-all-btn'),
    nonSubmissionPreview: document.getElementById('non-submission-preview'),
    copyNonSubmissionBtn: document.getElementById('copy-non-submission-btn'),
  };

  async function refreshAll() {
    await Promise.all([renderHomeworkSelect(), renderStudents(), renderCommonNotes()]);
    await renderReports();
  }

  // --- Homework session ---------------------------------------------------
  async function renderHomeworkSelect() {
    const homeworks = await storage.getHomeworks();
    const activeId = await storage.getActiveHomeworkId();
    els.homeworkSelect.innerHTML = homeworks
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(
        (h) =>
          `<option value="${h.id}" ${h.id === activeId ? 'selected' : ''}>${h.topic} (${h.numQuestions} Qs)</option>`
      )
      .join('');
    if (!homeworks.length) {
      els.homeworkSelect.innerHTML = '<option value="">No homeworks yet</option>';
    }
  }

  els.homeworkSelect.addEventListener('change', async (e) => {
    await storage.setActiveHomeworkId(e.target.value || null);
    await renderReports();
  });

  els.createHomeworkBtn.addEventListener('click', async () => {
    const topic = els.newTopic.value.trim();
    const numQuestions = Number(els.newQuestions.value);
    if (!topic || !numQuestions || numQuestions <= 0) {
      alert('Enter a topic and a valid number of questions.');
      return;
    }
    await storage.addHomework({ topic, numQuestions });
    els.newTopic.value = '';
    els.newQuestions.value = '';
    await renderHomeworkSelect();
    await renderReports();
  });

  els.deleteHomeworkBtn.addEventListener('click', async () => {
    const id = els.homeworkSelect.value;
    if (!id) return;
    if (!confirm('Delete this homework and all its recorded reports?')) return;
    await storage.removeHomework(id);
    await renderHomeworkSelect();
    await renderReports();
  });

  // --- Students -------------------------------------------------------
  async function renderStudents() {
    const students = await storage.getStudents();
    els.studentList.innerHTML = students
      .map(
        (s) => `
      <li class="ma-list-item" data-id="${s.id}">
        <input type="text" class="ma-inline-edit ma-student-name-input" value="${s.name.replace(/"/g, '&quot;')}" />
        <button class="ma-btn-danger ma-remove-student" data-id="${s.id}">Remove</button>
      </li>`
      )
      .join('') || '<li class="ma-empty">No students yet.</li>';
  }

  els.addStudentBtn.addEventListener('click', async () => {
    const name = els.newStudentName.value.trim();
    if (!name) return;
    await storage.addStudent(name);
    els.newStudentName.value = '';
    await renderStudents();
    await renderReports();
  });

  els.newStudentName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.addStudentBtn.click();
  });

  els.studentList.addEventListener('change', async (e) => {
    if (e.target.classList.contains('ma-student-name-input')) {
      const li = e.target.closest('.ma-list-item');
      await storage.renameStudent(li.dataset.id, e.target.value);
      await renderReports();
    }
  });

  els.studentList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('ma-remove-student')) {
      if (!confirm('Remove this student?')) return;
      await storage.removeStudent(e.target.dataset.id);
      await renderStudents();
      await renderReports();
    }
  });

  // --- Common notes -------------------------------------------------------
  async function renderCommonNotes() {
    const notes = await storage.getCommonNotes();
    els.commonNotesList.innerHTML = notes
      .map(
        (n) => `
      <li class="ma-list-item">
        <pre class="ma-note-text">${escapeHtml(n.text)}</pre>
        <button class="ma-btn-danger ma-remove-note" data-id="${n.id}">Remove</button>
      </li>`
      )
      .join('') || '<li class="ma-empty">No common notes.</li>';
  }

  els.addNoteBtn.addEventListener('click', async () => {
    const line = els.newNoteText.value.trim();
    if (!line) return;
    const text = `*\u203C\uFE0FNOTE\u203C\uFE0F*\n-${line}`;
    await storage.addCommonNote(text);
    els.newNoteText.value = '';
    await renderCommonNotes();
  });

  els.commonNotesList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('ma-remove-note')) {
      await storage.removeCommonNote(e.target.dataset.id);
      await renderCommonNotes();
      await renderReports();
    }
  });

  // --- Reports --------------------------------------------------------
  async function getActiveHomework() {
    const id = await storage.getActiveHomeworkId();
    if (!id) return null;
    const homeworks = await storage.getHomeworks();
    return homeworks.find((h) => h.id === id) || null;
  }

  async function renderReports() {
    const homework = await getActiveHomework();
    if (!homework) {
      els.reportsEmpty.hidden = false;
      els.reportsBody.hidden = true;
      return;
    }
    els.reportsEmpty.hidden = true;
    els.reportsBody.hidden = false;

    const [students, records, commonNotes] = await Promise.all([
      storage.getStudents(),
      storage.getRecordsForHomework(homework.id),
      storage.getCommonNotes(),
    ]);
    const commonNotesById = Object.fromEntries(commonNotes.map((n) => [n.id, n]));

    const { studentReports, nonSubmissionText } = report.generateAllReports({
      homework,
      students,
      records,
      commonNotesById,
    });

    const byStudentId = Object.fromEntries(studentReports.map((r) => [r.studentId, r]));

    els.reportsList.innerHTML = students
      .map((s) => {
        const rec = records[s.id];
        if (!rec) {
          return `
          <li class="ma-list-item ma-report-row">
            <span class="ma-report-name">${escapeHtml(s.name)}</span>
            <span class="ma-badge ma-badge-muted">not recorded</span>
          </li>`;
        }
        const r = byStudentId[s.id];
        return `
        <li class="ma-list-item ma-report-row">
          <span class="ma-report-name">${escapeHtml(s.name)}</span>
          <span class="ma-badge">${r.pct}%</span>
          <button class="ma-btn-secondary ma-copy-report" data-id="${s.id}">Copy</button>
        </li>`;
      })
      .join('') || '<li class="ma-empty">No students yet.</li>';

    els.nonSubmissionPreview.textContent = nonSubmissionText || '(everyone has a record)';

    els.reportsList.querySelectorAll('.ma-copy-report').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const r = byStudentId[btn.dataset.id];
        if (r) {
          await navigator.clipboard.writeText(r.text);
          btn.textContent = 'Copied!';
          setTimeout(() => (btn.textContent = 'Copy'), 1200);
        }
      });
    });

    els.copyAllBtn.onclick = async () => {
      const all = studentReports.map((r) => r.text).join('\n\n---\n\n');
      await navigator.clipboard.writeText(all);
      els.copyAllBtn.textContent = 'Copied!';
      setTimeout(() => (els.copyAllBtn.textContent = 'Copy All Reports'), 1200);
    };

    els.copyNonSubmissionBtn.onclick = async () => {
      if (!nonSubmissionText) return;
      await navigator.clipboard.writeText(nonSubmissionText);
      els.copyNonSubmissionBtn.textContent = 'Copied!';
      setTimeout(() => (els.copyNonSubmissionBtn.textContent = 'Copy'), 1200);
    };
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Keep popup in sync if data changes from the content-script panel while
  // the popup happens to be open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') refreshAll();
  });

  storage.ensureInitialized().then(refreshAll);
})();
