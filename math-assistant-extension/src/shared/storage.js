// Thin data-access layer over chrome.storage.local. Modern Chrome resolves
// chrome.storage.local.get/set as Promises when no callback is passed.
(function (global) {
  const MA = global.MA || {};
  const KEYS = MA.STORAGE_KEYS;

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) {
      return global.crypto.randomUUID();
    }
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  async function getAll() {
    const data = await chrome.storage.local.get([
      KEYS.STUDENTS,
      KEYS.HOMEWORKS,
      KEYS.RECORDS,
      KEYS.COMMON_NOTES,
      KEYS.ACTIVE_HOMEWORK_ID,
    ]);
    return {
      students: data[KEYS.STUDENTS] || [],
      homeworks: data[KEYS.HOMEWORKS] || [],
      records: data[KEYS.RECORDS] || {},
      commonNotes: data[KEYS.COMMON_NOTES] || MA.DEFAULT_COMMON_NOTES,
      activeHomeworkId: data[KEYS.ACTIVE_HOMEWORK_ID] || null,
    };
  }

  async function ensureInitialized() {
    const existing = await chrome.storage.local.get([KEYS.COMMON_NOTES]);
    if (!existing[KEYS.COMMON_NOTES]) {
      await chrome.storage.local.set({
        [KEYS.COMMON_NOTES]: MA.DEFAULT_COMMON_NOTES,
      });
    }
  }

  // --- Storage operation queue (mutex) -------------------------------------
  let storageQueue = Promise.resolve();

  function withStorageLock(fn) {
    const next = storageQueue.then(fn);
    storageQueue = next.catch(() => {});
    return next;
  }

  // --- Students -------------------------------------------------------
  async function getStudents() {
    const data = await chrome.storage.local.get([KEYS.STUDENTS]);
    return data[KEYS.STUDENTS] || [];
  }

  async function addStudent(name) {
    return withStorageLock(async () => {
      const students = await getStudents();
      const student = { id: uuid(), name: name.trim() };
      students.push(student);
      await chrome.storage.local.set({ [KEYS.STUDENTS]: students });
      return student;
    });
  }

  async function renameStudent(id, name) {
    return withStorageLock(async () => {
      const students = await getStudents();
      const s = students.find((x) => x.id === id);
      if (s) s.name = name.trim();
      await chrome.storage.local.set({ [KEYS.STUDENTS]: students });
    });
  }

  async function removeStudent(id) {
    return withStorageLock(async () => {
      const students = (await getStudents()).filter((x) => x.id !== id);
      await chrome.storage.local.set({ [KEYS.STUDENTS]: students });
    });
  }

  // --- Homeworks --------------------------------------------------------
  async function getHomeworks() {
    const data = await chrome.storage.local.get([KEYS.HOMEWORKS]);
    return data[KEYS.HOMEWORKS] || [];
  }

  async function addHomework({ topic, numQuestions }) {
    return withStorageLock(async () => {
      const homeworks = await getHomeworks();
      const homework = {
        id: uuid(),
        topic: topic.trim(),
        numQuestions: Number(numQuestions),
        createdAt: Date.now(),
      };
      homeworks.push(homework);
      await chrome.storage.local.set({
        [KEYS.HOMEWORKS]: homeworks,
        [KEYS.ACTIVE_HOMEWORK_ID]: homework.id,
      });
      return homework;
    });
  }

  async function updateHomework(id, patch) {
    return withStorageLock(async () => {
      const homeworks = await getHomeworks();
      const hw = homeworks.find((h) => h.id === id);
      if (hw) Object.assign(hw, patch);
      await chrome.storage.local.set({ [KEYS.HOMEWORKS]: homeworks });
    });
  }

  async function removeHomework(id) {
    return withStorageLock(async () => {
      const homeworks = (await getHomeworks()).filter((h) => h.id !== id);
      const data = await chrome.storage.local.get([KEYS.RECORDS, KEYS.ACTIVE_HOMEWORK_ID]);
      const records = data[KEYS.RECORDS] || {};
      for (const key of Object.keys(records)) {
        if (key.startsWith(id + ':')) delete records[key];
      }
      const active = data[KEYS.ACTIVE_HOMEWORK_ID] || null;
      const updates = {
        [KEYS.HOMEWORKS]: homeworks,
        [KEYS.RECORDS]: records,
      };
      if (active === id) {
        updates[KEYS.ACTIVE_HOMEWORK_ID] = null;
      }
      await chrome.storage.local.set(updates);
    });
  }

  async function getActiveHomeworkId() {
    const data = await chrome.storage.local.get([KEYS.ACTIVE_HOMEWORK_ID]);
    return data[KEYS.ACTIVE_HOMEWORK_ID] || null;
  }

  async function setActiveHomeworkId(id) {
    return withStorageLock(async () => {
      await chrome.storage.local.set({ [KEYS.ACTIVE_HOMEWORK_ID]: id });
    });
  }

  // --- Records ----------------------------------------------------------
  function recordKey(homeworkId, studentId) {
    return `${homeworkId}:${studentId}`;
  }

  async function getRecords() {
    const data = await chrome.storage.local.get([KEYS.RECORDS]);
    return data[KEYS.RECORDS] || {};
  }

  async function getRecordsForHomework(homeworkId) {
    const all = await getRecords();
    const result = {};
    const prefix = homeworkId + ':';
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(prefix)) {
        result[value.studentId] = value;
      }
    }
    return result;
  }

  function defaultRecord(homeworkId, studentId) {
    return {
      homeworkId,
      studentId,
      mistakes: 0,
      skipped: 0,
      sentOnTime: true,
      marked: true,
      notes: [],
      updatedAt: Date.now(),
    };
  }

  async function getRecord(homeworkId, studentId) {
    if (!homeworkId || !studentId) return null;
    const all = await getRecords();
    const existing = all[recordKey(homeworkId, studentId)];
    if (existing) {
      return { ...existing };
    }
    return defaultRecord(homeworkId, studentId);
  }

  async function saveRecord(record) {
    if (!record || !record.homeworkId || !record.studentId) return record;
    return withStorageLock(async () => {
      const all = await getRecords();
      const updated = {
        ...record,
        updatedAt: Date.now(),
      };
      all[recordKey(record.homeworkId, record.studentId)] = updated;
      await chrome.storage.local.set({ [KEYS.RECORDS]: all });
      return updated;
    });
  }

  async function updateRecord(homeworkId, studentId, patch) {
    if (!homeworkId || !studentId) return null;
    return withStorageLock(async () => {
      const all = await getRecords();
      const key = recordKey(homeworkId, studentId);
      const existing = all[key] || defaultRecord(homeworkId, studentId);
      const updated = {
        ...existing,
        ...patch,
        updatedAt: Date.now(),
      };
      all[key] = updated;
      await chrome.storage.local.set({ [KEYS.RECORDS]: all });
      return updated;
    });
  }

  async function deleteRecord(homeworkId, studentId) {
    if (!homeworkId || !studentId) return;
    return withStorageLock(async () => {
      const all = await getRecords();
      const key = recordKey(homeworkId, studentId);
      if (all[key]) {
        delete all[key];
        await chrome.storage.local.set({ [KEYS.RECORDS]: all });
      }
    });
  }

  // --- Common notes -------------------------------------------------------
  async function getCommonNotes() {
    const data = await chrome.storage.local.get([KEYS.COMMON_NOTES]);
    return data[KEYS.COMMON_NOTES] || MA.DEFAULT_COMMON_NOTES;
  }

  async function addCommonNote(text) {
    return withStorageLock(async () => {
      const notes = await getCommonNotes();
      const note = { id: uuid(), text };
      notes.push(note);
      await chrome.storage.local.set({ [KEYS.COMMON_NOTES]: notes });
      return note;
    });
  }

  async function removeCommonNote(id) {
    return withStorageLock(async () => {
      const notes = (await getCommonNotes()).filter((n) => n.id !== id);
      await chrome.storage.local.set({ [KEYS.COMMON_NOTES]: notes });
    });
  }

  MA.storage = {
    uuid,
    getAll,
    ensureInitialized,
    getStudents,
    addStudent,
    renameStudent,
    removeStudent,
    getHomeworks,
    addHomework,
    updateHomework,
    removeHomework,
    getActiveHomeworkId,
    setActiveHomeworkId,
    getRecords,
    getRecordsForHomework,
    getRecord,
    saveRecord,
    updateRecord,
    deleteRecord,
    getCommonNotes,
    addCommonNote,
    removeCommonNote,
  };

  global.MA = MA;
})(typeof window !== 'undefined' ? window : self);
