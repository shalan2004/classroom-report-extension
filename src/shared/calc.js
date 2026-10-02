// Pure calculation functions. No DOM, no storage — easy to unit test.
(function (global) {
  const MA = global.MA || {};

  /**
   * Round a value UP to the next whole number whenever it has any
   * fractional remainder; leaves whole numbers unchanged.
   * This is intentionally NOT Math.round(). Examples:
   *   85.6 -> 86, 85.5 -> 86, 85.1 -> 86, 85.0 -> 85
   * Rounds to 6 decimal places first to avoid floating point artifacts
   * (e.g. a mathematically-exact integer represented as 84.999999999998).
   */
  function ceilingRound(value) {
    const cleaned = Math.round(value * 1e6) / 1e6;
    return Math.ceil(cleaned);
  }

  function finalMark(numQuestions, mistakes, skipped) {
    return numQuestions - mistakes - skipped;
  }

  function rawPercentage(numQuestions, mistakes, skipped) {
    if (!numQuestions || numQuestions <= 0) return 0;
    const mark = finalMark(numQuestions, mistakes, skipped);
    return (mark / numQuestions) * 100;
  }

  function percentage(numQuestions, mistakes, skipped) {
    return ceilingRound(rawPercentage(numQuestions, mistakes, skipped));
  }

  function understandingLevel(pct) {
    const thresholds = MA.UNDERSTANDING_THRESHOLDS;
    for (const t of thresholds) {
      if (pct >= t.min) return t.level;
    }
    return MA.UNDERSTANDING.POOR;
  }

  /** Clamp a counter value to be >= 0 and a multiple of 0.5. */
  function clampCounter(value) {
    const step = MA.STEP || 0.5;
    const rounded = Math.round(value / step) * step;
    return Math.max(0, rounded);
  }

  /** Format a counter/grade number: drop ".0", keep ".5". */
  function formatNumber(value) {
    const rounded = Math.round(value * 2) / 2; // nearest half, defensive
    return String(rounded); // JS naturally prints 5 (not "5.0") and 2.5
  }

  MA.calc = {
    ceilingRound,
    finalMark,
    rawPercentage,
    percentage,
    understandingLevel,
    clampCounter,
    formatNumber,
  };

  global.MA = MA;
})(typeof window !== 'undefined' ? window : self);
