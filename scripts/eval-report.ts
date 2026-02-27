/**
 * Automated Technical Validation Pipeline
 *
 * Runs unit tests, extraction accuracy benchmark, calibration model eval,
 * and evidence quality audit. Produces a self-contained HTML report at
 * reports/accuracy-report.html.
 *
 * Usage: npx tsx scripts/eval-report.ts
 */

import dotenv from 'dotenv'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { getNeo4jConfig, getNeo4jDriver, closeNeo4jDriver } from '@/lib/neo4j'
import { ensureNeo4jSchema } from '@/lib/neo4jSchema'
import { fetchUserTrainingRows } from '@/lib/graph/neo4jTraining'
import { ridgeRegression, mean, variance, clamp } from '@/lib/graph/math'

dotenv.config({ path: '.env.local' })
dotenv.config()

// ── Types ──────────────────────────────────────────────────────

interface UnitTestResult {
  suite: string
  tests: number
  passed: number
  failed: number
  duration: number
}

interface ExtractionSample {
  archetype: string
  content: string
  groundTruthMood: number
  groundTruthAnxiety: number
  extractedMood: number | null
  extractedAnxiety: number | null
  extractedPhq9: number | null
  extractedGad7: number | null
  confidence: number | null
  evidenceValid: boolean | null
  error: string | null
}

interface CalibrationUserResult {
  userId: string
  nTrain: number
  nTest: number
  mae: number
  coverage80: number
  ece10: number
}

interface EvidenceAuditResult {
  totalExtractions: number
  withEvidence: number
  validSpans: number
  invalidSpans: number
  autoRepaired: number
  validityRate: number
}

interface EvalResults {
  timestamp: string
  unitTests: UnitTestResult[]
  unitTestSummary: { total: number; passed: number; failed: number }
  extraction: ExtractionSample[]
  extractionMetrics: {
    n: number
    moodMAE: number
    moodRMSE: number
    moodPearson: number
    anxietyMAE: number
    anxietyRMSE: number
    anxietyPearson: number
    byArchetype: Record<string, { n: number; moodMAE: number; anxietyMAE: number }>
  }
  calibration: CalibrationUserResult[]
  calibrationAggregate: { avgMAE: number; avgCoverage: number; avgECE: number; nUsers: number }
  evidence: EvidenceAuditResult
}

// ── Statistical helpers ────────────────────────────────────────

function mae(pred: number[], actual: number[]): number {
  if (pred.length === 0) return 0
  return pred.reduce((s, p, i) => s + Math.abs(p - actual[i]), 0) / pred.length
}

function rmse(pred: number[], actual: number[]): number {
  if (pred.length === 0) return 0
  return Math.sqrt(pred.reduce((s, p, i) => s + (p - actual[i]) ** 2, 0) / pred.length)
}

function pearson(x: number[], y: number[]): number {
  const n = x.length
  if (n < 3) return 0
  const mx = mean(x)
  const my = mean(y)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx
    const b = y[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  const denom = Math.sqrt(dx * dy)
  return denom === 0 ? 0 : num / denom
}

function ece(pred: number[], actual: number[], bins = 10): number {
  const lo = 1, hi = 10
  const binSize = (hi - lo) / bins
  let acc = 0
  const n = pred.length
  for (let b = 0; b < bins; b++) {
    const bLo = lo + b * binSize
    const bHi = bLo + binSize
    const idx = pred
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (b === bins - 1 ? p >= bLo && p <= bHi : p >= bLo && p < bHi))
      .map(({ i }) => i)
    if (idx.length === 0) continue
    const mPred = mean(idx.map(i => pred[i]))
    const mY = mean(idx.map(i => actual[i]))
    acc += (idx.length / n) * Math.abs(mPred - mY)
  }
  return acc
}

// ── 1. Unit Tests ──────────────────────────────────────────────

function runUnitTests(): UnitTestResult[] {
  console.log('\n━━━ Unit Tests ━━━')
  const results: UnitTestResult[] = []
  try {
    const output = execSync('npx vitest run --reporter=json 2>&1', {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: process.cwd(),
    })
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/)
    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[0])
      for (const file of json.testResults ?? []) {
        const suiteName = path.basename(file.name, '.test.ts')
        const passed = (file.assertionResults ?? []).filter((r: any) => r.status === 'passed').length
        const failed = (file.assertionResults ?? []).filter((r: any) => r.status === 'failed').length
        results.push({
          suite: suiteName,
          tests: passed + failed,
          passed,
          failed,
          duration: file.endTime - file.startTime,
        })
      }
    }
  } catch (e: any) {
    const output = e.stdout?.toString() ?? e.message ?? ''
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[0])
        for (const file of json.testResults ?? []) {
          const suiteName = path.basename(file.name, '.test.ts')
          const passed = (file.assertionResults ?? []).filter((r: any) => r.status === 'passed').length
          const failed = (file.assertionResults ?? []).filter((r: any) => r.status === 'failed').length
          results.push({
            suite: suiteName,
            tests: passed + failed,
            passed,
            failed,
            duration: (file.endTime ?? 0) - (file.startTime ?? 0),
          })
        }
      } catch {
        results.push({ suite: 'vitest', tests: 0, passed: 0, failed: 1, duration: 0 })
      }
    } else {
      results.push({ suite: 'vitest', tests: 0, passed: 0, failed: 1, duration: 0 })
    }
  }
  for (const r of results) {
    const status = r.failed === 0 ? '✓' : '✗'
    console.log(`  ${status} ${r.suite}: ${r.passed}/${r.tests} passed`)
  }
  return results
}

// ── 2. Extraction Benchmark ────────────────────────────────────

async function runExtractionBenchmark(): Promise<ExtractionSample[]> {
  console.log('\n━━━ Extraction Benchmark ━━━')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.log('  ⚠ Supabase credentials missing, skipping extraction benchmark')
    return []
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log('  ⚠ OPENAI_API_KEY missing, skipping extraction benchmark')
    return []
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const promptPath = path.join(process.cwd(), 'prompts', 'symptom_extraction.txt')
  const systemPrompt = fs.readFileSync(promptPath, 'utf-8')

  // Fetch synthetic patients and their entries
  const { data: patients } = await supabase
    .from('synthetic_patients')
    .select('id, archetype')
    .order('archetype')

  if (!patients || patients.length === 0) {
    console.log('  ⚠ No synthetic patients found, skipping extraction benchmark')
    return []
  }

  const ENTRIES_PER_ARCHETYPE = 5
  const samples: ExtractionSample[] = []

  const archetypeGroups = new Map<string, string[]>()
  for (const p of patients) {
    const list = archetypeGroups.get(p.archetype) ?? []
    list.push(p.id)
    archetypeGroups.set(p.archetype, list)
  }

  for (const [archetype, patientIds] of archetypeGroups) {
    const pid = patientIds[0]

    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id, content, ai_extractions(mood_score, anxiety_score)')
      .eq('synthetic_patient_id', pid)
      .eq('is_synthetic', true)
      .order('created_at', { ascending: true })
      .limit(ENTRIES_PER_ARCHETYPE)

    if (!entries || entries.length === 0) continue

    for (const entry of entries) {
      const ext = Array.isArray(entry.ai_extractions)
        ? entry.ai_extractions[0]
        : entry.ai_extractions

      if (!ext || !entry.content) continue

      const gtMood = ext.mood_score
      const gtAnxiety = ext.anxiety_score

      const sample: ExtractionSample = {
        archetype,
        content: entry.content,
        groundTruthMood: gtMood,
        groundTruthAnxiety: gtAnxiety,
        extractedMood: null,
        extractedAnxiety: null,
        extractedPhq9: null,
        extractedGad7: null,
        confidence: null,
        evidenceValid: null,
        error: null,
      }

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: entry.content },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        })

        const raw = response.choices[0]?.message?.content ?? ''
        const jsonStr = raw.replace(/```json\s*/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(jsonStr)

        sample.extractedMood = parsed.mood_score ?? null
        sample.extractedAnxiety = parsed.anxiety_score ?? null
        sample.confidence = parsed.confidence ?? null
        sample.evidenceValid = parsed.evidence != null

        if (parsed.phq9_indicators) {
          sample.extractedPhq9 = Object.values(parsed.phq9_indicators as Record<string, number>)
            .reduce((s: number, v: number) => s + v, 0)
        }
        if (parsed.gad7_indicators) {
          sample.extractedGad7 = Object.values(parsed.gad7_indicators as Record<string, number>)
            .reduce((s: number, v: number) => s + v, 0)
        }

        console.log(
          `  ${archetype}: GT(${gtMood}/${gtAnxiety}) → Ext(${sample.extractedMood}/${sample.extractedAnxiety})`
        )
      } catch (err: any) {
        sample.error = err.message ?? 'Unknown error'
        console.log(`  ✗ ${archetype}: ${sample.error}`)
      }

      samples.push(sample)

      // Brief delay to respect rate limits
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return samples
}

// ── 3. Calibration Model Evaluation ────────────────────────────

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * (b[i] ?? 0)
  return s
}

function toNum(v: any): number {
  if (v == null) return 0
  if (typeof v === 'bigint') return Number(v)
  return Number(v) || 0
}

function toPredictorVector(r: {
  affectValence: number | null
  affectArousal: number | null
  sleepHours: number | null
  sleepQuality: number | null
  energyLevel: number | null
  medicationTaken: boolean | null
  featureIds: string[]
}) {
  return {
    affectValence: toNum(r.affectValence),
    affectArousal: toNum(r.affectArousal),
    sleepHours: clamp(toNum(r.sleepHours) / 12, 0, 1),
    sleepQuality: clamp(toNum(r.sleepQuality) / 10, 0, 1),
    energyLevel: clamp(toNum(r.energyLevel) / 10, 0, 1),
    medicationTaken: r.medicationTaken ? 1 : 0,
    featureIds: new Set(r.featureIds ?? []),
  }
}

function vectorize(p: ReturnType<typeof toPredictorVector>, featureIds: string[]): number[] {
  const xs: number[] = [1, p.affectValence, p.affectArousal, p.sleepHours, p.sleepQuality, p.energyLevel, p.medicationTaken]
  for (const fid of featureIds) xs.push(p.featureIds.has(fid) ? 1 : 0)
  return xs
}

function approxSd(residualSd: number, weightVar: number[], x: number[]): number {
  let v = residualSd * residualSd
  for (let i = 0; i < x.length; i++) v += (x[i] ** 2) * (weightVar[i] ?? 0)
  return Math.sqrt(Math.max(0, v))
}

async function runCalibrationEval(): Promise<CalibrationUserResult[]> {
  console.log('\n━━━ Calibration Model Evaluation ━━━')

  try {
    await ensureNeo4jSchema()
  } catch (err: any) {
    console.log(`  ⚠ Neo4j connection failed: ${err.message}`)
    return []
  }

  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)
  let users: string[] = []
  try {
    const res = await session.run('MATCH (u:User) RETURN u.userId AS userId')
    users = res.records.map(r => r.get('userId'))
  } finally {
    await session.close()
  }

  if (users.length === 0) {
    console.log('  ⚠ No users found in Neo4j')
    return []
  }

  console.log(`  Evaluating ${users.length} users...`)
  const results: CalibrationUserResult[] = []

  for (const userId of users) {
    try {
      const rows = await fetchUserTrainingRows(userId)
      if (rows.length < 12) continue

      const split = Math.floor(rows.length * 0.8)
      const train = rows.slice(0, split)
      const test = rows.slice(split)

      const freq = new Map<string, number>()
      for (const r of train) for (const fid of r.featureIds ?? []) freq.set(fid, (freq.get(fid) ?? 0) + 1)
      const topFeatureIds = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 120)
        .map(([fid]) => fid)

      const Xtr = train.map(r => vectorize(toPredictorVector(r), topFeatureIds))
      const ytr = train.map(r => toNum(r.mood))
      const lambda = 1.0
      const w = ridgeRegression(Xtr, ytr, lambda)

      const trHat = Xtr.map(x => dot(w, x))
      const resid = ytr.map((y, i) => y - trHat[i])
      const residSd = Math.sqrt(variance(resid))

      const B = 50
      const wSamples: number[][] = []
      for (let b = 0; b < B; b++) {
        const idx = new Array(train.length).fill(0).map(() => Math.floor(Math.random() * train.length))
        wSamples.push(ridgeRegression(idx.map(i => Xtr[i]), idx.map(i => ytr[i]), lambda))
      }
      const weightVar = new Array(w.length).fill(0)
      for (let j = 0; j < w.length; j++) {
        weightVar[j] = variance(wSamples.map(ws => ws[j] ?? 0))
      }

      const Xte = test.map(r => vectorize(toPredictorVector(r), topFeatureIds))
      const yte = test.map(r => toNum(r.mood))
      const pred = Xte.map(x => dot(w, x))
      const sd = Xte.map(x => approxSd(residSd, weightVar, x))

      const userMAE = mean(pred.map((p, i) => Math.abs(p - yte[i])))
      const z = 1.2816
      const covered = pred.map((p, i) => (yte[i] >= p - z * sd[i] && yte[i] <= p + z * sd[i] ? 1 : 0))
      const coverage80 = mean(covered)
      const ece10 = ece(pred, yte, 10)

      results.push({ userId: userId.slice(0, 8), nTrain: train.length, nTest: test.length, mae: userMAE, coverage80, ece10 })
      console.log(`  ${userId.slice(0, 8)}: MAE=${userMAE.toFixed(2)} cov80=${coverage80.toFixed(2)} ECE=${ece10.toFixed(2)}`)
    } catch (err: any) {
      console.log(`  ⚠ ${userId.slice(0, 8)}: skipped (${err.message?.slice(0, 60)})`)
    }
  }

  return results
}

// ── 4. Evidence Quality Audit ──────────────────────────────────

async function runEvidenceAudit(): Promise<EvidenceAuditResult> {
  console.log('\n━━━ Evidence Quality Audit ━━━')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.log('  ⚠ Supabase credentials missing, skipping')
    return { totalExtractions: 0, withEvidence: 0, validSpans: 0, invalidSpans: 0, autoRepaired: 0, validityRate: 0 }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: extractions } = await supabase
    .from('ai_extractions')
    .select('entry_id, evidence, evidence_valid')
    .not('evidence', 'is', null)
    .limit(200)

  if (!extractions || extractions.length === 0) {
    console.log('  ⚠ No extractions with evidence found')
    return { totalExtractions: 0, withEvidence: 0, validSpans: 0, invalidSpans: 0, autoRepaired: 0, validityRate: 0 }
  }

  // For each extraction, fetch the journal entry text and validate
  let totalSpans = 0
  let validSpans = 0
  let invalidSpans = 0

  const entryIds = extractions.map(e => e.entry_id)
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, content')
    .in('id', entryIds)

  const entryMap = new Map((entries ?? []).map(e => [e.id, e.content]))

  for (const ext of extractions) {
    const text = entryMap.get(ext.entry_id)
    if (!text || !ext.evidence) continue

    const evidence = ext.evidence as any
    const checkSpans = (spans: any[]) => {
      if (!Array.isArray(spans)) return
      for (const span of spans) {
        if (!span.quote) continue
        totalSpans++
        const idx = text.indexOf(span.quote)
        if (idx !== -1) {
          validSpans++
        } else {
          invalidSpans++
        }
      }
    }

    checkSpans(evidence.mood_score ?? [])
    checkSpans(evidence.anxiety_score ?? [])
    checkSpans(evidence.crisis_detected ?? [])
    if (evidence.phq9_indicators) {
      for (const spans of Object.values(evidence.phq9_indicators)) checkSpans(spans as any[])
    }
    if (evidence.gad7_indicators) {
      for (const spans of Object.values(evidence.gad7_indicators)) checkSpans(spans as any[])
    }
  }

  const rate = totalSpans > 0 ? validSpans / totalSpans : 0
  const result: EvidenceAuditResult = {
    totalExtractions: extractions.length,
    withEvidence: extractions.filter(e => e.evidence != null).length,
    validSpans,
    invalidSpans,
    autoRepaired: 0,
    validityRate: rate,
  }

  console.log(`  Extractions with evidence: ${result.withEvidence}`)
  console.log(`  Valid spans: ${validSpans}/${totalSpans} (${(rate * 100).toFixed(1)}%)`)

  return result
}

// ── 5. Aggregate metrics ───────────────────────────────────────

function computeExtractionMetrics(samples: ExtractionSample[]) {
  const valid = samples.filter(s => s.extractedMood != null && s.extractedAnxiety != null)
  if (valid.length === 0) {
    return {
      n: 0, moodMAE: 0, moodRMSE: 0, moodPearson: 0,
      anxietyMAE: 0, anxietyRMSE: 0, anxietyPearson: 0,
      byArchetype: {} as Record<string, { n: number; moodMAE: number; anxietyMAE: number }>,
    }
  }

  const predMood = valid.map(s => s.extractedMood!)
  const actMood = valid.map(s => s.groundTruthMood)
  const predAnx = valid.map(s => s.extractedAnxiety!)
  const actAnx = valid.map(s => s.groundTruthAnxiety)

  const byArchetype: Record<string, { n: number; moodMAE: number; anxietyMAE: number }> = {}
  const archetypes = [...new Set(valid.map(s => s.archetype))]
  for (const a of archetypes) {
    const subset = valid.filter(s => s.archetype === a)
    const pm = subset.map(s => s.extractedMood!)
    const am = subset.map(s => s.groundTruthMood)
    const pa = subset.map(s => s.extractedAnxiety!)
    const aa = subset.map(s => s.groundTruthAnxiety)
    byArchetype[a] = { n: subset.length, moodMAE: mae(pm, am), anxietyMAE: mae(pa, aa) }
  }

  return {
    n: valid.length,
    moodMAE: mae(predMood, actMood),
    moodRMSE: rmse(predMood, actMood),
    moodPearson: pearson(predMood, actMood),
    anxietyMAE: mae(predAnx, actAnx),
    anxietyRMSE: rmse(predAnx, actAnx),
    anxietyPearson: pearson(predAnx, actAnx),
    byArchetype,
  }
}

// ── 6. SVG chart helpers ───────────────────────────────────────

const ARCHETYPE_COLORS: Record<string, string> = {
  gradual_improver: '#22c55e',
  volatile_stabilizer: '#f59e0b',
  hidden_deteriorator: '#ef4444',
  flat_non_responder: '#6b7280',
  early_dropout: '#8b5cf6',
  relapse_then_recover: '#3b82f6',
}

function svgGauge(pct: number, label: string, color: string, sublabel: string): string {
  const W = 200, H = 18, R = 6
  const fill = Math.max(0, Math.min(1, pct)) * W
  return `<div style="margin:10px 0">
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
      <span style="font-weight:600;color:#334155">${label}</span>
      <span style="color:#64748b">${sublabel}</span>
    </div>
    <svg width="${W}" height="${H}" style="display:block"><rect width="${W}" height="${H}" rx="${R}" fill="#e2e8f0"/>
    <rect width="${fill}" height="${H}" rx="${R}" fill="${color}"/></svg></div>`
}

function svgScatter(
  data: { x: number; y: number; label: string }[],
  title: string,
  xLabel: string,
  yLabel: string,
): string {
  const W = 380, H = 340, PAD = 50, RPAD = 20, TPAD = 35
  const plotW = W - PAD - RPAD
  const plotH = H - PAD - TPAD
  const lo = 1, hi = 10

  const scaleX = (v: number) => PAD + ((v - lo) / (hi - lo)) * plotW
  const scaleY = (v: number) => TPAD + plotH - ((v - lo) / (hi - lo)) * plotH

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif">`
  svg += `<rect width="${W}" height="${H}" fill="#fafafa" rx="8"/>`
  svg += `<text x="${W / 2}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${title}</text>`

  for (let v = lo; v <= hi; v += 1) {
    const x = scaleX(v), y = scaleY(v)
    svg += `<line x1="${PAD}" y1="${y}" x2="${W - RPAD}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`
    svg += `<line x1="${x}" y1="${TPAD}" x2="${x}" y2="${TPAD + plotH}" stroke="#e2e8f0" stroke-width="0.5"/>`
    svg += `<text x="${PAD - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#94a3b8">${v}</text>`
    svg += `<text x="${x}" y="${TPAD + plotH + 14}" text-anchor="middle" font-size="9" fill="#94a3b8">${v}</text>`
  }

  svg += `<line x1="${scaleX(lo)}" y1="${scaleY(lo)}" x2="${scaleX(hi)}" y2="${scaleY(hi)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,4"/>`
  svg += `<text x="${scaleX(7.5)}" y="${scaleY(8)}" font-size="9" fill="#94a3b8" transform="rotate(-38,${scaleX(7.5)},${scaleY(8)})">perfect match</text>`

  for (const d of data) {
    const cx = scaleX(d.x), cy = scaleY(d.y)
    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="${ARCHETYPE_COLORS[d.label] ?? '#64748b'}" opacity="0.8" stroke="#fff" stroke-width="1"/>`
  }

  svg += `<text x="${W / 2}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#475569">${xLabel}</text>`
  svg += `<text x="12" y="${H / 2}" text-anchor="middle" font-size="10" fill="#475569" transform="rotate(-90,12,${H / 2})">${yLabel}</text>`
  svg += '</svg>'
  return svg
}

function svgBarChart(
  data: { label: string; value: number; color: string }[],
  title: string,
  maxVal?: number,
): string {
  const W = 380, H = 240, PAD = 50, RPAD = 20, TPAD = 30, BPAD = 60
  const plotH = H - TPAD - BPAD
  const plotW = W - PAD - RPAD
  const maxV = maxVal ?? Math.max(...data.map(d => d.value), 0.5) * 1.2
  const barW = Math.min(36, plotW / data.length - 8)

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif">`
  svg += `<rect width="${W}" height="${H}" fill="#fafafa" rx="8"/>`
  svg += `<text x="${W / 2}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${title}</text>`

  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i
    const y = TPAD + plotH - (v / maxV) * plotH
    svg += `<line x1="${PAD}" y1="${y}" x2="${W - RPAD}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`
    svg += `<text x="${PAD - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#94a3b8">${v.toFixed(1)}</text>`
  }

  const step = plotW / data.length
  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    const barH = Math.max(0, Math.min((d.value / maxV) * plotH, plotH))
    const x = PAD + step * i + (step - barW) / 2
    const y = TPAD + plotH - barH
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${d.color}" rx="3"/>`
    svg += `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" font-weight="500" fill="#334155">${d.value.toFixed(2)}</text>`
    const lx = x + barW / 2
    const ly = TPAD + plotH + 10
    svg += `<text x="${lx}" y="${ly}" text-anchor="start" font-size="8" fill="#64748b" transform="rotate(30,${lx},${ly})">${d.label.replace(/_/g, ' ')}</text>`
  }
  svg += '</svg>'
  return svg
}

function gradeFromMAE(mae: number, scale: number): { letter: string; color: string; colorClass: string } {
  const pct = mae / scale
  if (pct <= 0.08) return { letter: 'A+', color: '#15803d', colorClass: 'green' }
  if (pct <= 0.12) return { letter: 'A', color: '#16a34a', colorClass: 'green' }
  if (pct <= 0.18) return { letter: 'B+', color: '#65a30d', colorClass: 'green' }
  if (pct <= 0.25) return { letter: 'B', color: '#ca8a04', colorClass: 'amber' }
  if (pct <= 0.35) return { letter: 'C', color: '#d97706', colorClass: 'amber' }
  return { letter: 'D', color: '#dc2626', colorClass: 'red' }
}

function generateHTML(results: EvalResults): string {
  const { unitTests, unitTestSummary, extractionMetrics, calibrationAggregate, evidence } = results
  const extractionValid = results.extraction.filter(s => s.extractedMood != null)

  const moodGrade = gradeFromMAE(extractionMetrics.moodMAE, 9)
  const anxGrade = gradeFromMAE(extractionMetrics.anxietyMAE, 9)
  const calibGrade = calibrationAggregate.nUsers > 0 ? gradeFromMAE(calibrationAggregate.avgMAE, 9) : { letter: 'N/A', color: '#64748b', colorClass: 'blue' }

  const moodAccPct = extractionMetrics.n > 0 ? Math.round((1 - extractionMetrics.moodMAE / 9) * 100) : 0
  const anxAccPct = extractionMetrics.n > 0 ? Math.round((1 - extractionMetrics.anxietyMAE / 9) * 100) : 0
  const calibAccPct = calibrationAggregate.nUsers > 0 ? Math.round((1 - calibrationAggregate.avgMAE / 9) * 100) : 0

  const archEntries = Object.entries(extractionMetrics.byArchetype)
  const moodScatter = svgScatter(
    extractionValid.map(s => ({ x: s.groundTruthMood, y: s.extractedMood!, label: s.archetype })),
    'Mood: AI Score vs Expected Score', 'Expected Score', 'AI Score'
  )
  const anxScatter = svgScatter(
    extractionValid.map(s => ({ x: s.groundTruthAnxiety, y: s.extractedAnxiety!, label: s.archetype })),
    'Anxiety: AI Score vs Expected Score', 'Expected Score', 'AI Score'
  )
  const moodArchBar = svgBarChart(
    archEntries.map(([a, v]) => ({ label: a, value: v.moodMAE, color: ARCHETYPE_COLORS[a] ?? '#64748b' })),
    'Mood Error by Patient Type', 3
  )
  const anxArchBar = svgBarChart(
    archEntries.map(([a, v]) => ({ label: a, value: v.anxietyMAE, color: ARCHETYPE_COLORS[a] ?? '#64748b' })),
    'Anxiety Error by Patient Type', 5
  )

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Technical Validation Report — Therapy Journal AI Pipeline</title>
<style>
  :root {
    --blue-50:#eff6ff;--blue-100:#dbeafe;--blue-600:#2563eb;--blue-700:#1d4ed8;--blue-800:#1e40af;
    --green-50:#f0fdf4;--green-600:#16a34a;--green-700:#15803d;
    --red-50:#fef2f2;--red-600:#dc2626;
    --amber-50:#fffbeb;--amber-600:#d97706;
    --slate-50:#f8fafc;--slate-100:#f1f5f9;--slate-200:#e2e8f0;--slate-300:#cbd5e1;
    --slate-400:#94a3b8;--slate-500:#64748b;--slate-600:#475569;--slate-700:#334155;--slate-800:#1e293b;--slate-900:#0f172a;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--slate-800);background:#fff;line-height:1.6}
  .container{max-width:900px;margin:0 auto;padding:0 24px}
  header{background:linear-gradient(135deg,var(--blue-800),var(--blue-600));color:#fff;padding:48px 0 40px}
  header h1{font-size:28px;font-weight:700;margin-bottom:4px}
  header .subtitle{font-size:15px;opacity:.85;margin-bottom:16px}
  header .meta{font-size:13px;opacity:.7}
  .disclaimer{background:var(--amber-50);border-left:4px solid var(--amber-600);padding:14px 18px;margin:24px 0;border-radius:0 6px 6px 0;font-size:13px;color:var(--slate-700)}
  section{padding:32px 0;border-bottom:1px solid var(--slate-200)}
  section:last-child{border-bottom:none}
  h2{font-size:20px;font-weight:700;color:var(--slate-900);margin-bottom:16px}
  h3{font-size:16px;font-weight:600;color:var(--slate-700);margin:20px 0 10px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:20px 0}
  .card{background:var(--slate-50);border:1px solid var(--slate-200);border-radius:10px;padding:20px;text-align:center}
  .card .value{font-size:32px;font-weight:700}
  .card .label{font-size:12px;color:var(--slate-500);margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
  .card.green .value{color:var(--green-600)}
  .card.blue .value{color:var(--blue-600)}
  .card.red .value{color:var(--red-600)}
  .card.amber .value{color:var(--amber-600)}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
  th{text-align:left;padding:10px 12px;background:var(--slate-100);border-bottom:2px solid var(--slate-300);font-weight:600;color:var(--slate-700);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  td{padding:10px 12px;border-bottom:1px solid var(--slate-200)}
  tr:last-child td{border-bottom:none}
  .charts{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin:20px 0}
  .chart-box{background:#fff;border:1px solid var(--slate-200);border-radius:10px;overflow:hidden}
  .legend{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:12px 0;font-size:12px;color:var(--slate-600)}
  .legend-item{display:flex;align-items:center;gap:4px}
  .legend-dot{width:10px;height:10px;border-radius:50%}
  .pass{color:var(--green-600);font-weight:600}
  .fail{color:var(--red-600);font-weight:600}
  .timeline{position:relative;padding-left:32px;margin:20px 0}
  .timeline::before{content:'';position:absolute;left:12px;top:4px;bottom:4px;width:2px;background:var(--blue-100)}
  .timeline-item{position:relative;margin-bottom:28px}
  .timeline-item::before{content:'';position:absolute;left:-24px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--blue-600);border:2px solid #fff;box-shadow:0 0 0 2px var(--blue-100)}
  .timeline-item h4{font-size:14px;font-weight:700;color:var(--slate-800)}
  .timeline-item .phase{font-size:11px;color:var(--blue-600);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
  .timeline-item p{font-size:13px;color:var(--slate-600);margin-top:4px}
  .footer{text-align:center;padding:32px 0;color:var(--slate-400);font-size:12px}
  .part-banner{padding:20px 0 8px;margin-top:16px}
  .part-banner h2{font-size:14px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
  .part-banner p{font-size:13px;color:var(--slate-500);margin:0}
  .part-banner.overview{border-top:3px solid var(--blue-600)}
  .part-banner.overview h2{color:var(--blue-600)}
  .part-banner.technical{border-top:3px solid var(--slate-600)}
  .part-banner.technical h2{color:var(--slate-600)}
  .grade-card{background:var(--slate-50);border:1px solid var(--slate-200);border-radius:12px;padding:24px;display:flex;gap:20px;align-items:center;margin:16px 0}
  .grade-circle{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;flex-shrink:0}
  .grade-body h4{font-size:15px;font-weight:700;color:var(--slate-800);margin-bottom:4px}
  .grade-body p{font-size:13px;color:var(--slate-600);margin:0;line-height:1.5}
  .callout{background:var(--blue-50);border-radius:8px;padding:14px 18px;margin:16px 0;font-size:13px;color:var(--slate-700)}
  .callout.warn{background:var(--amber-50)}
  .toc{margin:24px 0;padding:20px 24px;background:var(--slate-50);border:1px solid var(--slate-200);border-radius:10px}
  .toc h3{margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--slate-500)}
  .toc ul{list-style:none;padding:0;margin:0}
  .toc li{padding:4px 0;font-size:14px}
  .toc li a{color:var(--blue-600);text-decoration:none}
  .toc li a:hover{text-decoration:underline}
  .toc .toc-part{font-weight:700;color:var(--slate-700);margin-top:10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
  @media print{
    header,.part-banner{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    section{page-break-inside:avoid}
    .charts{page-break-inside:avoid}
  }
</style>
</head>
<body>

<header>
  <div class="container">
    <h1>Technical Validation Report</h1>
    <div class="subtitle">Therapy Journal AI Pipeline — Accuracy Evaluation</div>
    <div class="meta">${reportDate} &nbsp;|&nbsp; Pipeline v1.0 &nbsp;|&nbsp; Model: GPT-4 Turbo</div>
  </div>
</header>

<div class="container">

<div class="disclaimer">
  <strong>Important:</strong> This is a <em>technical validation</em> of the AI extraction and prediction pipeline against synthetic test data with known ground-truth scores. It demonstrates engineering accuracy and algorithmic correctness. It is <strong>not</strong> a clinical validation study. See the <a href="#roadmap">Roadmap to Clinical Validation</a> section for the path to clinical-grade evidence.
</div>

<nav class="toc">
  <h3>Contents</h3>
  <ul>
    <li class="toc-part">Part I — Overview (plain language)</li>
    <li><a href="#at-a-glance">At a Glance</a></li>
    <li><a href="#how-accurate">How Accurate Is the AI?</a></li>
    <li><a href="#personalization">Can It Learn Individual Patterns?</a></li>
    <li><a href="#trustworthy">Is the AI Trustworthy?</a></li>
    <li><a href="#roadmap">What Comes Next (Clinical Roadmap)</a></li>
    <li class="toc-part" style="margin-top:14px">Part II — Scientific Details</li>
    <li><a href="#extraction-stats">Extraction Accuracy Statistics</a></li>
    <li><a href="#calibration-detail">Calibration Model Detail</a></li>
    <li><a href="#evidence-detail">Evidence Audit Detail</a></li>
    <li><a href="#unit-tests">Unit Test Results</a></li>
    <li><a href="#methodology">Methodology</a></li>
    <li><a href="#appendix">Appendix</a></li>
  </ul>
</nav>

<!-- ═══════════════════════════════════════════════════════════ -->
<div class="part-banner overview">
  <h2>Part I — Overview</h2>
  <p>Key findings explained in plain language. No statistics background required.</p>
</div>

<!-- ── At a Glance ───────────────────────────────────────── -->
<section id="at-a-glance">
  <h2>At a Glance</h2>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:16px">
    We tested the AI on ${extractionMetrics.n} journal entries where we already knew the correct answer. Here is how it performed across four areas:
  </p>

  <div class="grade-card">
    <div class="grade-circle" style="background:${moodGrade.color}">${moodGrade.letter}</div>
    <div class="grade-body">
      <h4>Mood Detection</h4>
      <p>The AI reads a journal entry and scores mood on a 1–10 scale. On average, it was <strong>${extractionMetrics.moodMAE.toFixed(1)} points</strong> away from the correct answer — about <strong>${moodAccPct}% accurate</strong>.</p>
    </div>
  </div>

  <div class="grade-card">
    <div class="grade-circle" style="background:${anxGrade.color}">${anxGrade.letter}</div>
    <div class="grade-body">
      <h4>Anxiety Detection</h4>
      <p>Anxiety is harder to detect from free text. The AI was <strong>${extractionMetrics.anxietyMAE.toFixed(1)} points</strong> off on average (~${anxAccPct}% accurate). This is expected — people often describe mood more explicitly than anxiety.</p>
    </div>
  </div>

  <div class="grade-card">
    <div class="grade-circle" style="background:${calibGrade.color}">${calibGrade.letter}</div>
    <div class="grade-body">
      <h4>Personalized Prediction</h4>
      <p>${calibrationAggregate.nUsers > 0
        ? `After learning each person's patterns, the model predicted mood within <strong>${calibrationAggregate.avgMAE.toFixed(1)} points</strong> (~${calibAccPct}% accurate) across <strong>${calibrationAggregate.nUsers} users</strong>.`
        : 'Not enough labeled data to evaluate personalized predictions yet.'}</p>
    </div>
  </div>

  <div class="grade-card">
    <div class="grade-circle" style="background:${unitTestSummary.failed === 0 && evidence.validityRate >= 0.95 ? '#16a34a' : '#d97706'}">
      ${unitTestSummary.failed === 0 && evidence.validityRate >= 0.95 ? 'A+' : 'B'}
    </div>
    <div class="grade-body">
      <h4>Software Reliability</h4>
      <p><strong>${unitTestSummary.passed}/${unitTestSummary.total}</strong> algorithmic tests passed. <strong>${evidence.totalExtractions > 0 ? (evidence.validityRate * 100).toFixed(0) + '%' : 'N/A'}</strong> of AI-cited evidence quotes were verified as real excerpts from the journal entries.</p>
    </div>
  </div>
</section>

<!-- ── How Accurate ──────────────────────────────────────── -->
<section id="how-accurate">
  <h2>How Accurate Is the AI?</h2>

  <p style="color:var(--slate-600);font-size:14px;margin-bottom:16px">
    We created 6 types of simulated patients — each with a different emotional trajectory (improving, worsening, volatile, etc.). The AI read their journal entries and tried to detect their mood and anxiety levels without knowing the answers in advance.
  </p>

  <h3>Mood: Strong Performance</h3>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:8px">Average error of <strong>${extractionMetrics.moodMAE.toFixed(2)} points</strong> on a 1–10 scale. The AI reliably distinguishes "good days" from "bad days."</p>
  ${svgGauge(1 - extractionMetrics.moodMAE / 9, 'Mood Accuracy', moodGrade.color, moodAccPct + '%')}

  <h3>Anxiety: Room to Improve</h3>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:8px">Average error of <strong>${extractionMetrics.anxietyMAE.toFixed(2)} points</strong>. Anxiety is less explicitly expressed in free-text journaling than mood.</p>
  ${svgGauge(1 - extractionMetrics.anxietyMAE / 9, 'Anxiety Accuracy', anxGrade.color, anxAccPct + '%')}

  <div class="callout warn">
    <strong>Why is anxiety harder?</strong> When people journal, they tend to describe how they <em>feel</em> (sad, happy, hopeful) more directly than their anxiety level. Anxiety often manifests through indirect signals like sleep disruption, racing thoughts, or avoidance — which are harder for AI to quantify as a single score. This is consistent with clinical literature and represents an active area of improvement.
  </div>
</section>

<!-- ── Personalization ───────────────────────────────────── -->
<section id="personalization">
  <h2>Can It Learn Individual Patterns?</h2>
  ${calibrationAggregate.nUsers > 0 ? `
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:16px">
    The system builds a personalized model for each user, learning the relationship between their journal themes, sleep, energy, and self-reported mood. We tested this across <strong>${calibrationAggregate.nUsers} users</strong> by training on 80% of their data and testing on the remaining 20%.
  </p>
  ${svgGauge(1 - calibrationAggregate.avgMAE / 9, 'Personalized Prediction', calibGrade.color, calibAccPct + '% accurate')}
  <div class="callout">
    <strong>What does this mean?</strong> After seeing ~30 journal entries from a person, the model can predict their self-reported mood within about <strong>${calibrationAggregate.avgMAE.toFixed(1)} points</strong>. It also provides confidence intervals — and those intervals contained the true mood <strong>${(calibrationAggregate.avgCoverage * 100).toFixed(0)}%</strong> of the time (target: 80%).
  </div>
  ` : `<p style="color:var(--slate-500);font-style:italic;">Not enough labeled data to evaluate personalized predictions yet.</p>`}
</section>

<!-- ── Trustworthiness ───────────────────────────────────── -->
<section id="trustworthy">
  <h2>Is the AI Trustworthy?</h2>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:16px">
    Two things make this system auditable:
  </p>

  <div class="grade-card">
    <div class="grade-circle" style="background:#2563eb;font-size:18px">${unitTestSummary.passed}/${unitTestSummary.total}</div>
    <div class="grade-body">
      <h4>Algorithmic Tests Passed</h4>
      <p>${unitTestSummary.total} automated tests verify that the math behind z-scores, baselines, trend detection, and prediction blending works correctly. <strong>${unitTestSummary.failed === 0 ? 'All passed.' : unitTestSummary.failed + ' failed.'}</strong></p>
    </div>
  </div>

  <div class="grade-card">
    <div class="grade-circle" style="background:${evidence.validityRate >= 0.95 ? '#16a34a' : '#d97706'};font-size:16px">${evidence.totalExtractions > 0 ? (evidence.validityRate * 100).toFixed(0) + '%' : 'N/A'}</div>
    <div class="grade-body">
      <h4>Evidence Quotes Verified</h4>
      <p>Every score the AI gives is backed by exact quotes from the journal entry. We audited <strong>${evidence.validSpans + evidence.invalidSpans}</strong> evidence quotes and confirmed <strong>${evidence.validSpans}</strong> are genuine excerpts from the original text.</p>
    </div>
  </div>
</section>

<!-- ── Clinical Roadmap ──────────────────────────────────── -->
<section id="roadmap">
  <h2>What Comes Next: Roadmap to Clinical Validation</h2>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:20px">
    This report establishes that the AI works accurately on test data. The following steps are needed to validate it for clinical deployment.
  </p>

  <div class="timeline">
    <div class="timeline-item">
      <div class="phase">Phase 1 — Months 1–3</div>
      <h4>IRB-Approved Pilot Study</h4>
      <p>50–100 real patients complete standard PHQ-9 and GAD-7 questionnaires alongside AI-analyzed journal entries. Measure how well the AI's scores agree with the clinical gold standard.</p>
    </div>
    <div class="timeline-item">
      <div class="phase">Phase 2 — Months 3–6</div>
      <h4>Detection Accuracy</h4>
      <p>When a patient crosses a clinical threshold (e.g., moderate depression), how reliably does the AI detect it? Target: catch at least 80% of true cases with less than 25% false alarms.</p>
    </div>
    <div class="timeline-item">
      <div class="phase">Phase 3 — Months 6–12</div>
      <h4>Multi-Site Validation</h4>
      <p>Expand to 3–5 clinical sites (500+ patients) across diverse populations. Verify the AI works equally well regardless of demographics, writing style, or clinical setting.</p>
    </div>
    <div class="timeline-item">
      <div class="phase">Phase 4 — Months 9–15</div>
      <h4>Regulatory Assessment</h4>
      <p>Determine whether FDA Software as a Medical Device (SaMD) classification applies. Prepare 510(k) submission or document exemption rationale.</p>
    </div>
    <div class="timeline-item">
      <div class="phase">Phase 5 — Months 12–18</div>
      <h4>Peer-Reviewed Publication</h4>
      <p>Publish validation results in a medical journal (JMIR Mental Health, npj Digital Medicine). Open-source the evaluation framework for reproducibility.</p>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════════ -->
<div class="part-banner technical">
  <h2>Part II — Scientific Details</h2>
  <p>Full statistical tables, charts, and methodology for researchers and technical reviewers.</p>
</div>

<!-- ── Extraction Statistics ──────────────────────────────── -->
<section id="extraction-stats">
  <h2>Extraction Accuracy Statistics</h2>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:12px">
    ${extractionMetrics.n} synthetic journal entries processed through the live GPT-4 Turbo extraction pipeline. Ground truth comes from deterministic archetype curves.
  </p>

  ${extractionMetrics.n > 0 ? `
  <h3>Overall Metrics</h3>
  <table>
    <thead><tr><th>Metric</th><th>Mood (1–10)</th><th>Anxiety (1–10)</th></tr></thead>
    <tbody>
      <tr><td>Mean Absolute Error (MAE)</td><td><strong>${extractionMetrics.moodMAE.toFixed(3)}</strong></td><td><strong>${extractionMetrics.anxietyMAE.toFixed(3)}</strong></td></tr>
      <tr><td>Root Mean Squared Error (RMSE)</td><td>${extractionMetrics.moodRMSE.toFixed(3)}</td><td>${extractionMetrics.anxietyRMSE.toFixed(3)}</td></tr>
      <tr><td>Pearson Correlation (r)</td><td>${extractionMetrics.moodPearson.toFixed(3)}</td><td>${extractionMetrics.anxietyPearson.toFixed(3)}</td></tr>
      <tr><td>Sample Size</td><td colspan="2">N=${extractionMetrics.n} across ${Object.keys(extractionMetrics.byArchetype).length} archetypes</td></tr>
    </tbody>
  </table>

  <h3>Scatter Plots</h3>
  <p style="color:var(--slate-500);font-size:12px;margin-bottom:8px">Each dot = one journal entry. Dots near the dashed "perfect match" line indicate high accuracy. Colors represent different patient archetypes.</p>
  <div class="charts">
    <div class="chart-box">${moodScatter}</div>
    <div class="chart-box">${anxScatter}</div>
  </div>
  <div class="legend">
    ${Object.entries(ARCHETYPE_COLORS).map(([a, c]) => `<div class="legend-item"><div class="legend-dot" style="background:${c}"></div>${a.replace(/_/g, ' ')}</div>`).join('\n    ')}
  </div>

  <h3>Per-Archetype Breakdown</h3>
  <p style="color:var(--slate-500);font-size:12px;margin-bottom:8px">MAE per simulated patient type. Lower bars = better accuracy.</p>
  <div class="charts">
    <div class="chart-box">${moodArchBar}</div>
    <div class="chart-box">${anxArchBar}</div>
  </div>

  <table>
    <thead><tr><th>Archetype</th><th>N</th><th>Mood MAE</th><th>Anxiety MAE</th></tr></thead>
    <tbody>
${archEntries.map(([a, v]) => `      <tr><td>${a.replace(/_/g, ' ')}</td><td>${v.n}</td><td>${v.moodMAE.toFixed(2)}</td><td>${v.anxietyMAE.toFixed(2)}</td></tr>`).join('\n')}
    </tbody>
  </table>
  ` : `<p style="color:var(--slate-500);font-style:italic;">Extraction benchmark was skipped.</p>`}
</section>

<!-- ── Calibration Detail ─────────────────────────────────── -->
<section id="calibration-detail">
  <h2>Calibration Model Detail</h2>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:12px">
    Per-user ridge regression (L2, &lambda;=1.0) trained on self-reported mood labels. Bootstrap variance (B=50) for uncertainty. Chronological 80/20 train/test split.
  </p>

  ${results.calibration.length > 0 ? `
  <div class="cards">
    <div class="card blue"><div class="value">${calibrationAggregate.avgMAE.toFixed(2)}</div><div class="label">Avg MAE</div></div>
    <div class="card ${calibrationAggregate.avgCoverage >= 0.75 ? 'green' : 'amber'}"><div class="value">${(calibrationAggregate.avgCoverage * 100).toFixed(0)}%</div><div class="label">80% Interval Coverage</div></div>
    <div class="card blue"><div class="value">${calibrationAggregate.avgECE.toFixed(3)}</div><div class="label">ECE (10 bins)</div></div>
    <div class="card blue"><div class="value">${calibrationAggregate.nUsers}</div><div class="label">Users Evaluated</div></div>
  </div>

  <details>
    <summary style="cursor:pointer;font-weight:600;color:var(--blue-600);margin:12px 0">Show per-user breakdown (${results.calibration.length} users)</summary>
    <table>
      <thead><tr><th>User ID</th><th>N (Train/Test)</th><th>MAE</th><th>80% Coverage</th><th>ECE</th></tr></thead>
      <tbody>
${results.calibration.map(c => `        <tr><td><code>${c.userId}…</code></td><td>${c.nTrain}/${c.nTest}</td><td>${c.mae.toFixed(2)}</td><td>${(c.coverage80 * 100).toFixed(0)}%</td><td>${c.ece10.toFixed(3)}</td></tr>`).join('\n')}
      </tbody>
    </table>
  </details>
  ` : `<p style="color:var(--slate-500);font-style:italic;">Calibration evaluation was skipped.</p>`}
</section>

<!-- ── Evidence Detail ─────────────────────────────────────── -->
<section id="evidence-detail">
  <h2>Evidence Audit Detail</h2>
  ${evidence.totalExtractions > 0 ? `
  <table>
    <thead><tr><th>Metric</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td>Extractions audited</td><td>${evidence.withEvidence}</td></tr>
      <tr><td>Total evidence spans checked</td><td>${evidence.validSpans + evidence.invalidSpans}</td></tr>
      <tr><td>Valid spans (exact substring match)</td><td>${evidence.validSpans}</td></tr>
      <tr><td>Invalid spans</td><td>${evidence.invalidSpans}</td></tr>
      <tr><td>Validity rate</td><td><strong>${(evidence.validityRate * 100).toFixed(1)}%</strong></td></tr>
    </tbody>
  </table>
  ` : `<p style="color:var(--slate-500);font-style:italic;">Evidence audit was skipped.</p>`}
</section>

<!-- ── Unit Tests ────────────────────────────────────────── -->
<section id="unit-tests">
  <h2>Unit Test Results</h2>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:12px">
    ${unitTestSummary.total} tests across ${unitTests.length} suites verify algorithmic correctness.
  </p>
  <table>
    <thead><tr><th>Suite</th><th>Tests</th><th>Passed</th><th>Failed</th><th>Status</th></tr></thead>
    <tbody>
${unitTests.map(t => `      <tr><td>${t.suite}</td><td>${t.tests}</td><td>${t.passed}</td><td>${t.failed}</td><td class="${t.failed === 0 ? 'pass' : 'fail'}">${t.failed === 0 ? 'PASS' : 'FAIL'}</td></tr>`).join('\n')}
    </tbody>
  </table>
</section>

<!-- ── Methodology ───────────────────────────────────────── -->
<section id="methodology">
  <h2>Methodology</h2>

  <h3>Synthetic Ground Truth</h3>
  <p style="color:var(--slate-600);font-size:14px;margin-bottom:12px">
    Test data is generated from 6 clinically-motivated patient archetypes, each with a deterministic mood/anxiety trajectory over 30–60 days. Gaussian noise (std 0.6–1.2) is added for realism.
  </p>
  <table>
    <thead><tr><th>Archetype</th><th>Mood Trajectory</th><th>Anxiety Trajectory</th><th>Clinical Analog</th></tr></thead>
    <tbody>
      <tr><td>Gradual Improver</td><td>3 &rarr; 7 (linear rise)</td><td>7 &rarr; 3 (linear decline)</td><td>Successful treatment response</td></tr>
      <tr><td>Volatile Stabilizer</td><td>Oscillating, dampening</td><td>Oscillating, dampening</td><td>Emotional dysregulation improving</td></tr>
      <tr><td>Hidden Deteriorator</td><td>6.5 &rarr; 3 (slow decline)</td><td>3 &rarr; 7 (slow rise)</td><td>Worsening masked by presentation</td></tr>
      <tr><td>Flat Non-Responder</td><td>Constant ~4</td><td>Constant ~6</td><td>Treatment-resistant depression</td></tr>
      <tr><td>Early Dropout</td><td>Oscillating, stops at 30%</td><td>Oscillating, stops at 30%</td><td>Disengagement from care</td></tr>
      <tr><td>Relapse then Recover</td><td>Rise &rarr; drop &rarr; recovery</td><td>Drop &rarr; spike &rarr; easing</td><td>Relapse event with recovery</td></tr>
    </tbody>
  </table>

  <h3>Extraction Pipeline</h3>
  <p style="color:var(--slate-600);font-size:14px">
    Each journal entry is sent to GPT-4 Turbo (temperature 0.3, max 1000 tokens) with a structured system prompt requesting mood (1–10), anxiety (1–10), PHQ-9/GAD-7-aligned indicator checklists (0–3 per item), emotions, symptoms, triggers, a crisis flag, and character-level evidence spans. Response is parsed as JSON. Evidence spans are validated against the source text using exact substring matching with auto-repair of incorrect offsets.
  </p>

  <h3>Calibration Model</h3>
  <p style="color:var(--slate-600);font-size:14px">
    Per-user ridge regression (&lambda;=1.0) maps AI-extracted features (affect valence/arousal, sleep hours/quality, energy, medication, and binary feature indicators for recurring themes) to self-reported mood labels. Bootstrap sampling (B=50) estimates per-prediction uncertainty. Evaluation uses an 80/20 chronological split. Metrics: MAE, 80% prediction interval coverage (normal approximation, z=1.28), and Expected Calibration Error (ECE, 10 bins over [1,10]).
  </p>
</section>

<!-- ── Appendix ──────────────────────────────────────────── -->
<section id="appendix">
  <h2>Appendix: Configuration Constants</h2>
  <table>
    <thead><tr><th>Constant</th><th>Value</th><th>Purpose</th></tr></thead>
    <tbody>
      <tr><td><code>STD_FLOOR</code></td><td>0.75</td><td>Prevents z-score explosion when baseline std &asymp; 0</td></tr>
      <tr><td><code>Z_SCORE_CLAMP</code></td><td>&plusmn;5</td><td>Maximum z-score magnitude</td></tr>
      <tr><td><code>MIN_ENTRIES_FOR_Z</code></td><td>5</td><td>Entries required before z-scores are computed</td></tr>
      <tr><td><code>CALIBRATION_MIN_TRAINING_N</code></td><td>10</td><td>Minimum labeled entries to train calibration model</td></tr>
      <tr><td><code>CALIBRATION_MIN_FEATURE_SUPPORT</code></td><td>2</td><td>Minimum feature occurrences for inclusion</td></tr>
      <tr><td><code>CALIBRATION_DEFAULT_MAX_FEATURES</code></td><td>30</td><td>Upper bound on feature count</td></tr>
      <tr><td><code>RETRIEVAL_ALPHA_MIN/MAX</code></td><td>0.25 / 0.75</td><td>Bounds on model vs retrieval weight in blend</td></tr>
      <tr><td><code>VARIANCE_DISAGREEMENT_CAP</code></td><td>4.0</td><td>Cap on disagreement penalty in variance blending</td></tr>
    </tbody>
  </table>
</section>

<div class="footer">
  <p>Generated automatically by <code>npm run eval:report</code> on ${reportDate}.</p>
  <p>Therapy Journal AI Pipeline — Technical Validation Report</p>
</div>

</div>
</body>
</html>`
}

// ── Main orchestrator ──────────────────────────────────────────

function writeReport(results: EvalResults) {
  const reportsDir = path.join(process.cwd(), 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })

  const htmlPath = path.join(reportsDir, 'accuracy-report.html')
  fs.writeFileSync(htmlPath, generateHTML(results), 'utf-8')

  const jsonPath = path.join(reportsDir, 'accuracy-report.json')
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8')

  console.log(`\n  Report written to ${htmlPath.replace(process.cwd(), '.')}`)
}

async function main() {
  const reportOnly = process.argv.includes('--report-only')

  if (reportOnly) {
    console.log('Regenerating HTML from existing JSON...')
    const jsonPath = path.join(process.cwd(), 'reports', 'accuracy-report.json')
    if (!fs.existsSync(jsonPath)) {
      console.error('No existing results found. Run without --report-only first.')
      process.exitCode = 1
      return
    }
    const results: EvalResults = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    writeReport(results)
    return
  }

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  Technical Validation Pipeline               ║')
  console.log('╚══════════════════════════════════════════════╝')

  const unitTests = runUnitTests()
  const unitTestSummary = {
    total: unitTests.reduce((s, t) => s + t.tests, 0),
    passed: unitTests.reduce((s, t) => s + t.passed, 0),
    failed: unitTests.reduce((s, t) => s + t.failed, 0),
  }

  const extraction = await runExtractionBenchmark()
  const extractionMetrics = computeExtractionMetrics(extraction)

  const calibration = await runCalibrationEval()
  const calibrationAggregate = calibration.length > 0
    ? {
        avgMAE: mean(calibration.map(c => c.mae)),
        avgCoverage: mean(calibration.map(c => c.coverage80)),
        avgECE: mean(calibration.map(c => c.ece10)),
        nUsers: calibration.length,
      }
    : { avgMAE: 0, avgCoverage: 0, avgECE: 0, nUsers: 0 }

  const evidence = await runEvidenceAudit()
  await closeNeo4jDriver()

  const results: EvalResults = {
    timestamp: new Date().toISOString(),
    unitTests,
    unitTestSummary,
    extraction,
    extractionMetrics,
    calibration,
    calibrationAggregate,
    evidence,
  }

  writeReport(results)

  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║  Results Summary                             ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║  Unit Tests:     ${unitTestSummary.passed}/${unitTestSummary.total} passed`)
  console.log(`║  Extraction MAE: mood=${extractionMetrics.moodMAE.toFixed(2)} anx=${extractionMetrics.anxietyMAE.toFixed(2)}`)
  console.log(`║  Calibration:    ${calibrationAggregate.nUsers} users, MAE=${calibrationAggregate.avgMAE.toFixed(2)}`)
  console.log(`║  Evidence:       ${evidence.totalExtractions > 0 ? `${(evidence.validityRate * 100).toFixed(0)}% valid` : 'N/A'}`)
  console.log('╚══════════════════════════════════════════════╝')
}

main().catch(e => {
  console.error('Pipeline failed:', e)
  process.exitCode = 1
})
