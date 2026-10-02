// Shared constants used by the content script and the popup.
// Loaded as a plain classic script (not an ES module) so it can be listed
// directly in manifest.json's content_scripts and also via a <script> tag
// in popup.html, sharing one global namespace: `window.MA`.
(function (global) {
  const MA = global.MA || {};

  MA.STORAGE_KEYS = {
    STUDENTS: 'students',
    HOMEWORKS: 'homeworks',
    RECORDS: 'records',
    COMMON_NOTES: 'commonNotes',
    ACTIVE_HOMEWORK_ID: 'activeHomeworkId',
  };

  MA.EMOJI = {
    GREEN: '🟢',
    RED: '🔴',
    EXCELLENT: '👏',
    TROPHY: '🏆',
    CIRCLE: '⭕️',
    CROSS: '❌',
    NOTE_HEADER: '‼️NOTE‼️',
    BANG: '‼️',
  };

  MA.UNDERSTANDING = {
    EXCELLENT: 'Excellent',
    VERY_GOOD: 'V. Good',
    GOOD: 'Good',
    AVERAGE: 'Average',
    POOR: 'Poor',
  };

  // Thresholds are inclusive lower bounds, checked from highest to lowest.
  // See plan.md section 6 for the documented discrepancy with one sample.
  MA.UNDERSTANDING_THRESHOLDS = [
    { min: 85, level: MA.UNDERSTANDING.EXCELLENT },
    { min: 75, level: MA.UNDERSTANDING.VERY_GOOD },
    { min: 65, level: MA.UNDERSTANDING.GOOD },
    { min: 50, level: MA.UNDERSTANDING.AVERAGE },
    { min: -Infinity, level: MA.UNDERSTANDING.POOR },
  ];

  MA.AUTO_NOT_MARKED_NOTE =
    '*\u203C\uFE0FNOTE\u203C\uFE0F*\n-Remember to mark your answers from the footer\u203C\uFE0F';

  MA.DEFAULT_COMMON_NOTES = [
    {
      id: 'default-recording',
      text:
        '*\u203C\uFE0FNOTE\u203C\uFE0F*\n-Give the recording another look and complete your HW\u203C\uFE0F',
    },
    {
      id: 'default-steps',
      text: '*\u203C\uFE0FNOTE\u203C\uFE0F*\n-Don\u2019t forget to write the steps\u203C\uFE0F',
    },
    {
      id: 'default-ruler',
      text: '*\u203C\uFE0FNOTE\u203C\uFE0F*\n-Please use a ruler\u203C\uFE0F',
    },
  ];

  MA.STEP = 0.5;

  global.MA = MA;
})(typeof window !== 'undefined' ? window : self);
