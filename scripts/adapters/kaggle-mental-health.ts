/**
 * Adapter for the "Sentiment Analysis for Mental Health" Kaggle dataset.
 *
 * Dataset URL:
 *   https://www.kaggle.com/datasets/suchintikasarkar/sentiment-analysis-for-mental-health
 *
 * Expected CSV columns (header row):
 *   - Column 0 or "unique_id"  (unused)
 *   - Column 1 or "statement"  — the text we treat as journal content
 *   - Column 2 or "status"     — diagnostic label
 *
 * Labels observed in this dataset:
 *   Normal, Depression, Suicidal, Anxiety, Stress, Bipolar, Personality disorder
 *
 * Download the CSV, place it in  data/  and pass the path to load().
 */

import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { DatasetAdapter, NormalizedEntry } from './types'

// ---------------------------------------------------------------------------
// Label → mood-score range
// ---------------------------------------------------------------------------

const LABEL_RANGES: Record<string, [lo: number, hi: number]> = {
  'normal':                [5, 7],
  'personality disorder':  [5, 7],
  'anxiety':               [4, 6],
  'stress':                [4, 6],
  'depression':            [2, 4],
  'bipolar':               [3, 8],
  'suicidal':              [1, 3],
}

const DEFAULT_RANGE: [number, number] = [4, 6]

/** Seeded Gaussian noise (Box-Muller). */
function gaussianNoise(mean = 0, std = 0.6): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return mean + std * Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function labelToMood(label: string): number {
  const key = label.trim().toLowerCase()
  const [lo, hi] = LABEL_RANGES[key] ?? DEFAULT_RANGE
  const base = lo + Math.random() * (hi - lo)
  return Math.round(clamp(base + gaussianNoise(0, 0.5), 1, 10))
}

// ---------------------------------------------------------------------------
// CSV helpers  (no external dep — dataset is simple enough for readline)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/** Max entries per synthetic user (partition wraps around). */
const ENTRIES_PER_USER = 150

export const kaggleMentalHealthAdapter: DatasetAdapter = {
  name: 'Kaggle Sentiment Analysis for Mental Health',

  async *load(filePath: string): AsyncGenerator<NormalizedEntry> {
    const rl = createInterface({
      input: createReadStream(filePath, 'utf-8'),
      crlfDelay: Infinity,
    })

    let isHeader = true
    // Track how many rows we've yielded per category so we can assign users
    const categoryCounter = new Map<string, number>()

    for await (const rawLine of rl) {
      if (isHeader) {
        isHeader = false
        continue
      }

      const cols = parseCSVLine(rawLine)

      // Columns: unique_id (0), statement (1), status (2)
      const text = (cols[1] ?? '').trim()
      const label = (cols[2] ?? '').trim()

      if (!text || text.length < 20) continue // skip very short / empty rows

      const key = label.toLowerCase()
      const count = categoryCounter.get(key) ?? 0
      categoryCounter.set(key, count + 1)

      const userBucket = Math.floor(count / ENTRIES_PER_USER)
      const syntheticUserId = `kaggle_${key.replace(/\s+/g, '_')}_${userBucket}`

      yield {
        text,
        moodProxy: labelToMood(label),
        diagnosticCategory: label,
        syntheticUserId,
      }
    }
  },
}

export default kaggleMentalHealthAdapter
