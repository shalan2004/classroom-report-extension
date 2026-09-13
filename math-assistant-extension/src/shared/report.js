// Pure WhatsApp report-text generation. No DOM, no storage — easy to test
// byte-for-byte against the samples in plan.md section 7.
(function (global) {
  const MA = global.MA || {};
  const E = MA.EMOJI;
  const calc = MA.calc;

  function statusCircle(isGood) {
    return isGood ? E.GREEN : E.RED;
  }

  function generateStudentReport(student, homework, record, opts) {
    opts = opts || {};
    const isHighest = !!opts.isHighest;
    const commonNotes = opts.commonNotes || []; // array of {id, text} in selection order

    const mistakes = record.mistakes || 0;
    const skipped = record.skipped || 0;
    const pct = calc.percentage(homework.numQuestions, mistakes, skipped);
    const level = calc.understandingLevel(pct);

    const lines = [];

    if (isHighest) {
      lines.push(`${E.TROPHY} *${student.name}* ${E.TROPHY}`);
    } else {
      lines.push(`*${student.name}*`);
    }
    lines.push('');

    lines.push(`*${E.CIRCLE}${homework.topic}${E.CIRCLE}*`);

    lines.push(
      record.sentOnTime
        ? `-HW sent on time${E.GREEN}`
        : `-HW sent LATE${E.RED}`
    );
    lines.push(
      record.marked ? `-HW marked ${E.GREEN}` : `-HW NOT marked ${E.RED}`
    );
    lines.push(
      `-Mistakes ${calc.formatNumber(mistakes)} ${statusCircle(mistakes === 0)}`
    );
    lines.push(
      `-Skipped questions ${calc.formatNumber(skipped)} ${statusCircle(
        skipped === 0
      )}`
    );

    const understandingText =
      level === MA.UNDERSTANDING.EXCELLENT
        ? `${level} ${E.EXCELLENT}`
        : level;
    lines.push(`-Understanding (${understandingText})`);
    lines.push(`-Grade: *${pct}%*`);

    const noteBlocks = [];
    if (!record.marked) {
      noteBlocks.push(MA.AUTO_NOT_MARKED_NOTE);
    }
    for (const note of commonNotes) {
      noteBlocks.push(note.text);
    }

    let text = lines.join('\n');
    if (noteBlocks.length > 0) {
      text += '\n\n' + noteBlocks.join('\n\n');
    }

    return text;
  }

  function generateNonSubmissionReport(homework, missingStudents) {
    const header = `${E.CROSS}*Didn\u2019t send ${homework.topic} HW*${E.CROSS}`;
    const names = missingStudents.map((s) => s.name);
    return [header, ...names].join('\n');
  }

  /**
   * Builds every student report + the non-submission report for a
   * homework, determining the highest grade automatically. Ties: all tied
   * students receive the trophy tag (see plan.md section 7).
   */
  function generateAllReports({
    homework,
    students,
    records,
    commonNotesById,
  }) {
    commonNotesById = commonNotesById || {};

    // Students with a record are "participating"; students in the full
    // list with no record are treated as non-submissions (plan.md §10).
    const participating = [];
    const missing = [];

    for (const student of students) {
      const record = records[student.id];
      if (record) {
        participating.push({ student, record });
      } else {
        missing.push(student);
      }
    }

    let highestPct = -Infinity;
    const withPct = participating.map(({ student, record }) => {
      const pct = calc.percentage(
        homework.numQuestions,
        record.mistakes || 0,
        record.skipped || 0
      );
      if (pct > highestPct) highestPct = pct;
      return { student, record, pct };
    });

    const studentReports = withPct.map(({ student, record, pct }) => {
      const commonNotes = (record.notes || [])
        .map((id) => commonNotesById[id])
        .filter(Boolean);
      const text = generateStudentReport(student, homework, record, {
        isHighest: pct === highestPct && participating.length > 0,
        commonNotes,
      });
      return { studentId: student.id, text, pct };
    });

    const nonSubmissionText =
      missing.length > 0 ? generateNonSubmissionReport(homework, missing) : '';

    return { studentReports, nonSubmissionText, missing };
  }

  MA.report = {
    generateStudentReport,
    generateNonSubmissionReport,
    generateAllReports,
  };

  global.MA = MA;
})(typeof window !== 'undefined' ? window : self);
