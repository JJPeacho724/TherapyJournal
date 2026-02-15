/**
 * Generates synthetic structured data (sleep, energy, medication)
 * correlated with a mood proxy score so the calibration model
 * learns realistic covariance patterns.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function gaussianNoise(std: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return std * Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SyntheticStructuredLog {
  sleep_hours: number
  sleep_quality: number
  energy_level: number
  medication_taken: boolean
  medication_notes: string | null
}

/**
 * Generate a plausible structured log given a mood proxy.
 *
 * Correlations:
 *   - sleep_hours ≈ 5 + 0.3 * (mood - 5) + noise  (range 3-11)
 *   - sleep_quality ≈ mood + noise                  (range 1-10)
 *   - energy_level  ≈ mood + noise                  (range 1-10)
 *   - medication_taken = weighted random, higher probability
 *     for lower mood (i.e. clinical categories)
 *
 * @param mood  Simulated self-report mood score (1-10)
 * @param diagnosticCategory  Original dataset label (for medication probability)
 */
export function generateStructuredLog(
  mood: number,
  diagnosticCategory: string,
): SyntheticStructuredLog {
  const sleepHours = clamp(
    5 + 0.3 * (mood - 5) + gaussianNoise(1.2),
    3,
    11,
  )

  const sleepQuality = Math.round(clamp(
    mood + gaussianNoise(1.0),
    1,
    10,
  ))

  const energyLevel = Math.round(clamp(
    mood + gaussianNoise(1.0),
    1,
    10,
  ))

  // Medication probability depends on category
  const cat = diagnosticCategory.toLowerCase()
  let medProb = 0.25 // baseline
  if (cat.includes('depression'))           medProb = 0.7
  else if (cat.includes('suicidal'))        medProb = 0.8
  else if (cat.includes('bipolar'))         medProb = 0.75
  else if (cat.includes('anxiety'))         medProb = 0.55
  else if (cat.includes('stress'))          medProb = 0.3
  else if (cat.includes('normal'))          medProb = 0.15
  // GoEmotions categories
  else if (cat.includes('grief') || cat.includes('sadness') || cat.includes('fear'))
    medProb = 0.5

  const medicationTaken = Math.random() < medProb

  return {
    sleep_hours: Math.round(sleepHours * 10) / 10, // one decimal
    sleep_quality: sleepQuality,
    energy_level: energyLevel,
    medication_taken: medicationTaken,
    medication_notes: medicationTaken
      ? (Math.random() < 0.3 ? 'Took as prescribed' : null)
      : null,
  }
}
