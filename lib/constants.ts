/**
 * Centralized constants for the score-generation pipeline.
 *
 * All tuning knobs and magic numbers live here so they are
 * easy to audit, test, and reconfigure.
 */

// ── EWMA / Z-Score hardening ────────────────────────────────

/** Floor applied to baseline std before dividing in z-score calc. Prevents explosion when std ≈ 0. */
export const STD_FLOOR = 0.75

/** Absolute magnitude clamp on z-scores. */
export const Z_SCORE_CLAMP = 5

/** Minimum number of entries before z-scores are computed (null until then = "collecting baseline"). */
export const MIN_ENTRIES_FOR_Z = 5

// ── Calibration (ridge regression) ───────────────────────────

/** Minimum labeled entries to train a user calibration model. */
export const CALIBRATION_MIN_TRAINING_N = 10

/** A feature must appear in at least this many labeled entries to be included. */
export const CALIBRATION_MIN_FEATURE_SUPPORT = 2

/** Default upper bound on feature count (further capped by floor(N/2)). */
export const CALIBRATION_DEFAULT_MAX_FEATURES = 30

/** Minimum features surviving filters to use feature indicators; below this, train base-only. */
export const CALIBRATION_MIN_FEATURES_TO_USE = 5

// ── Retrieval blending ───────────────────────────────────────

/** Lower bound on alpha (model weight in blend). */
export const RETRIEVAL_ALPHA_MIN = 0.25

/** Upper bound on alpha (model weight in blend). */
export const RETRIEVAL_ALPHA_MAX = 0.75

/** Cap on the squared mean-disagreement term in variance blending. */
export const VARIANCE_DISAGREEMENT_CAP = 4.0

// ── Compliance labels ────────────────────────────────────────

export const PHQ9_ALIGNED_LABEL =
  'PHQ-9-aligned indicators (text-derived; not an administered questionnaire)'

export const GAD7_ALIGNED_LABEL =
  'GAD-7-aligned indicators (text-derived; not an administered questionnaire)'
