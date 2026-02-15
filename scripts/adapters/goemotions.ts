/**
 * Adapter for the GoEmotions dataset (Google Research).
 *
 * Dataset URL:
 *   https://github.com/google-research/google-research/tree/master/goemotions
 *
 * Download the **full_dataset/** TSV files and concatenate (or pass one split).
 * Expected TSV columns (tab-separated, NO header row):
 *   0  text
 *   1  comma-separated emotion label IDs (e.g. "4,18")
 *   2  example_id
 *
 * Emotion label IDs are mapped using the emotions.txt file that ships with the
 * dataset. We embed the mapping here so users don't need a second file.
 *
 * Download instruction:
 *   wget https://raw.githubusercontent.com/google-research/google-research/master/goemotions/data/full_dataset/goemotions_1.csv
 *   (and _2.csv, _3.csv — they are actually TSV despite the .csv extension)
 *   Concatenate them into  data/goemotions.tsv  and pass that path.
 */

import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { DatasetAdapter, NormalizedEntry } from './types'

// ---------------------------------------------------------------------------
// GoEmotions emotion IDs (0-27)
// Source: goemotions/data/emotions.txt
// ---------------------------------------------------------------------------

const EMOTION_LABELS: string[] = [
  'admiration',      // 0
  'amusement',       // 1
  'anger',           // 2
  'annoyance',       // 3
  'approval',        // 4
  'caring',          // 5
  'confusion',       // 6
  'curiosity',       // 7
  'desire',          // 8
  'disappointment',  // 9
  'disapproval',     // 10
  'disgust',         // 11
  'embarrassment',   // 12
  'excitement',      // 13
  'fear',            // 14
  'gratitude',       // 15
  'grief',           // 16
  'joy',             // 17
  'love',            // 18
  'nervousness',     // 19
  'optimism',        // 20
  'pride',           // 21
  'realization',     // 22
  'relief',          // 23
  'remorse',         // 24
  'sadness',         // 25
  'surprise',        // 26
  'neutral',         // 27
]

// ---------------------------------------------------------------------------
// Emotion → mood-valence mapping (higher = more positive mood)
// ---------------------------------------------------------------------------

const EMOTION_VALENCE: Record<string, number> = {
  admiration:     8,
  amusement:      8,
  anger:          3,
  annoyance:      4,
  approval:       7,
  caring:         7,
  confusion:      5,
  curiosity:      6,
  desire:         6,
  disappointment: 3,
  disapproval:    4,
  disgust:        3,
  embarrassment:  4,
  excitement:     8,
  fear:           2,
  gratitude:      8,
  grief:          1,
  joy:            9,
  love:           9,
  nervousness:    3,
  optimism:       8,
  pride:          8,
  realization:    6,
  relief:         7,
  remorse:        3,
  sadness:        2,
  surprise:       6,
  neutral:        5,
}

// Group emotions into broad buckets for synthetic-user partitioning
const EMOTION_GROUP: Record<string, string> = {
  admiration:     'positive',
  amusement:      'positive',
  approval:       'positive',
  caring:         'positive',
  excitement:     'positive',
  gratitude:      'positive',
  joy:            'positive',
  love:           'positive',
  optimism:       'positive',
  pride:          'positive',
  relief:         'positive',
  anger:          'negative',
  annoyance:      'negative',
  disappointment: 'negative',
  disapproval:    'negative',
  disgust:        'negative',
  embarrassment:  'negative',
  fear:           'negative',
  grief:          'negative',
  nervousness:    'negative',
  remorse:        'negative',
  sadness:        'negative',
  confusion:      'ambiguous',
  curiosity:      'ambiguous',
  desire:         'ambiguous',
  realization:    'ambiguous',
  surprise:       'ambiguous',
  neutral:        'neutral',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function gaussianNoise(std = 0.6): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return std * Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2)
}

function emotionIdsToMood(ids: number[]): number {
  if (ids.length === 0) return 5
  const valences = ids.map((id) => EMOTION_VALENCE[EMOTION_LABELS[id] ?? 'neutral'] ?? 5)
  const avg = valences.reduce((a, b) => a + b, 0) / valences.length
  return Math.round(clamp(avg + gaussianNoise(0.5), 1, 10))
}

function dominantGroup(ids: number[]): string {
  if (ids.length === 0) return 'neutral'
  const counts: Record<string, number> = {}
  for (const id of ids) {
    const g = EMOTION_GROUP[EMOTION_LABELS[id] ?? 'neutral'] ?? 'neutral'
    counts[g] = (counts[g] ?? 0) + 1
  }
  let best = 'neutral'
  let bestN = 0
  for (const [g, n] of Object.entries(counts)) {
    if (n > bestN) { best = g; bestN = n }
  }
  return best
}

const ENTRIES_PER_USER = 150

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const goEmotionsAdapter: DatasetAdapter = {
  name: 'GoEmotions (Google Research)',

  async *load(filePath: string): AsyncGenerator<NormalizedEntry> {
    const rl = createInterface({
      input: createReadStream(filePath, 'utf-8'),
      crlfDelay: Infinity,
    })

    const groupCounter = new Map<string, number>()

    for await (const rawLine of rl) {
      const cols = rawLine.split('\t')
      if (cols.length < 2) continue

      const text = (cols[0] ?? '').trim()
      const emotionField = (cols[1] ?? '').trim()

      if (!text || text.length < 15) continue // skip tiny fragments

      const emotionIds = emotionField
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0 && n < EMOTION_LABELS.length)

      const mood = emotionIdsToMood(emotionIds)
      const group = dominantGroup(emotionIds)
      const emotionNames = emotionIds.map((id) => EMOTION_LABELS[id]).join('+')

      const count = groupCounter.get(group) ?? 0
      groupCounter.set(group, count + 1)
      const bucket = Math.floor(count / ENTRIES_PER_USER)
      const syntheticUserId = `goemotions_${group}_${bucket}`

      yield {
        text,
        moodProxy: mood,
        diagnosticCategory: emotionNames || 'neutral',
        syntheticUserId,
      }
    }
  },
}

export default goEmotionsAdapter
