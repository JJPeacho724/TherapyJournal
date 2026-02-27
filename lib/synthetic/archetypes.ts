/**
 * Synthetic archetype definitions.
 *
 * Each archetype defines deterministic curves for mood and anxiety scores
 * over a configurable number of days, plus a theme pool.
 * Seeded pseudo-random noise ensures reproducibility.
 */

import type { Archetype } from '@/types/synthetic'

export interface ArchetypeConfig {
  archetype: Archetype
  /** Deterministic mood score for a given day (before noise). */
  moodCurve: (day: number, totalDays: number) => number
  /** Deterministic anxiety score for a given day (before noise). */
  anxietyCurve: (day: number, totalDays: number) => number
  /** Day at which entries stop (null = generate all days). */
  dropoutDay: ((totalDays: number) => number) | null
  /** Themes this archetype tends to surface. */
  themePool: string[]
  /** How many themes per entry (min, max). */
  themesPerEntry: [number, number]
}

// Simple seeded PRNG (mulberry32)
export function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Add seeded Gaussian noise (Box-Muller). */
export function gaussianNoise(rng: () => number, std: number): number {
  const u1 = rng()
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
  return z * std
}

export const ARCHETYPE_CONFIGS: Record<Archetype, ArchetypeConfig> = {
  gradual_improver: {
    archetype: 'gradual_improver',
    moodCurve: (day, total) => 3 + (4 * day) / total,
    anxietyCurve: (day, total) => 7 - (4 * day) / total,
    dropoutDay: null,
    themePool: ['motivation', 'sleep', 'social_connection', 'exercise', 'self_care', 'work_stress', 'worry', 'physical_anxiety'],
    themesPerEntry: [2, 3],
  },
  volatile_stabilizer: {
    archetype: 'volatile_stabilizer',
    moodCurve: (day, total) => {
      const dampening = 1 - (day / total) * 0.7
      const oscillation = 3 * Math.sin((day / 4) * Math.PI) * dampening
      return 5 + oscillation
    },
    anxietyCurve: (day, total) => {
      const dampening = 1 - (day / total) * 0.7
      const oscillation = 2.5 * Math.cos((day / 4) * Math.PI) * dampening
      return 5 + oscillation
    },
    dropoutDay: null,
    themePool: ['irritability', 'panic', 'sleep', 'rumination', 'appetite', 'social_withdrawal', 'work_stress', 'worry', 'hypervigilance'],
    themesPerEntry: [2, 3],
  },
  hidden_deteriorator: {
    archetype: 'hidden_deteriorator',
    moodCurve: (day, total) => 6.5 - (3.5 * day) / total,
    anxietyCurve: (day, total) => 3 + (4 * day) / total,
    dropoutDay: null,
    themePool: ['rumination', 'social_withdrawal', 'appetite', 'sleep', 'substance_use', 'work_stress', 'motivation', 'worry', 'physical_anxiety', 'avoidance'],
    themesPerEntry: [1, 3],
  },
  flat_non_responder: {
    archetype: 'flat_non_responder',
    moodCurve: () => 4,
    anxietyCurve: () => 6,
    dropoutDay: null,
    themePool: ['sleep', 'appetite', 'motivation', 'work_stress', 'worry'],
    themesPerEntry: [1, 2],
  },
  early_dropout: {
    archetype: 'early_dropout',
    moodCurve: (day) => 4 + 1.5 * Math.sin(day * 0.8),
    anxietyCurve: (day) => 6 - Math.cos(day * 0.6),
    dropoutDay: (total) => Math.min(Math.floor(total * 0.3), 18),
    themePool: ['sleep', 'work_stress', 'social_withdrawal', 'motivation', 'irritability', 'worry', 'avoidance'],
    themesPerEntry: [1, 2],
  },
  relapse_then_recover: {
    archetype: 'relapse_then_recover',
    moodCurve: (day, total) => {
      const phase1End = total * 0.4
      const phase2End = total * 0.6
      if (day <= phase1End) {
        return 4 + (3 * day) / phase1End
      } else if (day <= phase2End) {
        const drop = (day - phase1End) / (phase2End - phase1End)
        return 7 - 4 * drop
      } else {
        const recovery = (day - phase2End) / (total - phase2End)
        return 3 + 4 * recovery
      }
    },
    anxietyCurve: (day, total) => {
      const phase1End = total * 0.4
      const phase2End = total * 0.6
      if (day <= phase1End) {
        return 7 - (3 * day) / phase1End
      } else if (day <= phase2End) {
        const spike = (day - phase2End) / (phase2End - phase1End)
        return 4 + 4 * spike
      } else {
        const ease = (day - phase2End) / (total - phase2End)
        return 8 - 4 * ease
      }
    },
    dropoutDay: null,
    themePool: ['substance_use', 'sleep', 'rumination', 'panic', 'social_withdrawal', 'motivation', 'self_care', 'social_connection', 'physical_anxiety', 'hypervigilance'],
    themesPerEntry: [2, 3],
  },
}

/** Generate mood and anxiety scores for a single day, with seeded noise. */
export function generateDayScores(
  config: ArchetypeConfig,
  day: number,
  totalDays: number,
  rng: () => number
): { mood: number; anxiety: number } {
  const baseMood = config.moodCurve(day, totalDays)
  const baseAnxiety = config.anxietyCurve(day, totalDays)
  const noiseStd = config.archetype === 'volatile_stabilizer' ? 1.2 : 0.6

  const mood = clamp(
    Math.round((baseMood + gaussianNoise(rng, noiseStd)) * 10) / 10,
    1, 10
  )
  const anxiety = clamp(
    Math.round((baseAnxiety + gaussianNoise(rng, noiseStd)) * 10) / 10,
    1, 10
  )
  return { mood, anxiety }
}

const ANXIETY_THEMES = ['worry', 'physical_anxiety', 'avoidance', 'hypervigilance', 'panic', 'rumination']

/** Pick themes for a day based on the archetype, mood, and anxiety level. */
export function pickThemes(
  config: ArchetypeConfig,
  mood: number,
  anxiety: number,
  rng: () => number
): string[] {
  const [min, max] = config.themesPerEntry
  const count = min + Math.floor(rng() * (max - min + 1))
  const pool = [...config.themePool]

  // Weight negative mood themes more when mood is low
  if (mood <= 4 && pool.includes('rumination')) {
    pool.push('social_withdrawal')
  }
  if (mood >= 7 && pool.includes('motivation')) {
    pool.push('motivation', 'self_care')
  }

  // Weight anxiety themes more when anxiety is high
  if (anxiety >= 6) {
    for (const t of ANXIETY_THEMES) {
      if (pool.includes(t)) pool.push(t, t)
    }
  }
  // Weight calming themes when anxiety is low
  if (anxiety <= 3) {
    for (const t of ['exercise', 'self_care', 'social_connection']) {
      if (pool.includes(t)) pool.push(t)
    }
  }

  const selected: string[] = []

  // Guarantee at least one anxiety theme when anxiety is notable
  const availableAnxiety = pool.filter(t => ANXIETY_THEMES.includes(t))
  if (anxiety >= 5 && availableAnxiety.length > 0) {
    const forced = availableAnxiety[Math.floor(rng() * availableAnxiety.length)]
    selected.push(forced)
    const idx = pool.indexOf(forced)
    if (idx !== -1) pool.splice(idx, 1)
  }

  for (let i = selected.length; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length)
    const theme = pool[idx]
    if (!selected.includes(theme)) {
      selected.push(theme)
    }
    pool.splice(idx, 1)
  }
  return selected
}
