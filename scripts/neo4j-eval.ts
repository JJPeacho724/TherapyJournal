import dotenv from 'dotenv'
import { closeNeo4jDriver, getNeo4jConfig, getNeo4jDriver } from '@/lib/neo4j'
import { ensureNeo4jSchema } from '@/lib/neo4jSchema'
import { fetchUserTrainingRows, storeUserCalibrationModel, type StoredCalibrationModel } from '@/lib/graph/neo4jTraining'
import { clamp, mean, ridgeRegression, variance } from '@/lib/graph/math'

const MODEL_VERSION = 'calib_ridge_bootstrap_v1_eval'

// Prefer Next.js-style env file for local dev, then fall back to .env
dotenv.config({ path: '.env.local' })
dotenv.config()

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * (b[i] ?? 0)
  return s
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
  const sleepHours = r.sleepHours ?? 0
  const sleepQuality = r.sleepQuality ?? 0
  const energyLevel = r.energyLevel ?? 0
  return {
    affectValence: r.affectValence ?? 0,
    affectArousal: r.affectArousal ?? 0,
    sleepHours: clamp(sleepHours / 12, 0, 1),
    sleepQuality: clamp(sleepQuality / 10, 0, 1),
    energyLevel: clamp(energyLevel / 10, 0, 1),
    medicationTaken: r.medicationTaken ? 1 : 0,
    featureIds: new Set(r.featureIds ?? []),
  }
}

function vectorize(p: ReturnType<typeof toPredictorVector>, featureIds: string[]): number[] {
  const xs: number[] = [
    1,
    p.affectValence,
    p.affectArousal,
    p.sleepHours,
    p.sleepQuality,
    p.energyLevel,
    p.medicationTaken,
  ]
  for (const fid of featureIds) xs.push(p.featureIds.has(fid) ? 1 : 0)
  return xs
}

function approxSd(residualSd: number, weightVar: number[], x: number[]) {
  let v = residualSd * residualSd
  for (let i = 0; i < x.length; i++) v += (x[i] ** 2) * (weightVar[i] ?? 0)
  return Math.sqrt(Math.max(0, v))
}

function ece(pred: number[], y: number[], bins = 10) {
  const lo = 1
  const hi = 10
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
    const mPred = mean(idx.map((i) => pred[i]))
    const mY = mean(idx.map((i) => y[i]))
    acc += (idx.length / n) * Math.abs(mPred - mY)
  }
  return acc
}

async function listUsers(): Promise<string[]> {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)
  try {
    const res = await session.run(`MATCH (u:User) RETURN u.userId AS userId`)
    return res.records.map((r) => r.get('userId')) as string[]
  } finally {
    await session.close()
  }
}

async function main() {
  await ensureNeo4jSchema()

  const users = await listUsers()
  // eslint-disable-next-line no-console
  console.log(`Evaluating ${users.length} users...`)

  for (const userId of users) {
    const rows = await fetchUserTrainingRows(userId)
    if (rows.length < 12) continue

    const split = Math.floor(rows.length * 0.8)
    const train = rows.slice(0, split)
    const test = rows.slice(split)

    // Top features from train only (prevents leakage)
    const freq = new Map<string, number>()
    for (const r of train) for (const fid of r.featureIds ?? []) freq.set(fid, (freq.get(fid) ?? 0) + 1)
    const topFeatureIds = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120)
      .map(([fid]) => fid)

    const Xtr = train.map((r) => vectorize(toPredictorVector(r), topFeatureIds))
    const ytr = train.map((r) => r.mood)
    const lambda = 1.0
    const w = ridgeRegression(Xtr, ytr, lambda)

    // Residual sd on train
    const trHat = Xtr.map((x) => dot(w, x))
    const resid = ytr.map((yy, i) => yy - trHat[i])
    const residSd = Math.sqrt(variance(resid))

    // Simple bootstrap diagonal var (small B for eval speed)
    const B = 50
    const wSamples: number[][] = []
    for (let b = 0; b < B; b++) {
      const idx = new Array(train.length).fill(0).map(() => Math.floor(Math.random() * train.length))
      const Xb = idx.map((i) => Xtr[i])
      const yb = idx.map((i) => ytr[i])
      wSamples.push(ridgeRegression(Xb, yb, lambda))
    }
    const weightVar = new Array(w.length).fill(0)
    for (let j = 0; j < w.length; j++) {
      weightVar[j] = variance(wSamples.map((ws) => ws[j] ?? 0))
    }

    const Xte = test.map((r) => vectorize(toPredictorVector(r), topFeatureIds))
    const yte = test.map((r) => r.mood)
    const pred = Xte.map((x) => dot(w, x))
    const sd = Xte.map((x) => approxSd(residSd, weightVar, x))

    const mae = mean(pred.map((p, i) => Math.abs(p - yte[i])))
    // 80% interval ~ +/- 1.28 sd (normal approx)
    const z = 1.2816
    const covered = pred.map((p, i) => (yte[i] >= p - z * sd[i] && yte[i] <= p + z * sd[i] ? 1 : 0))
    const coverage80 = mean(covered)
    const ece10 = ece(pred, yte, 10)

    const model: StoredCalibrationModel = {
      modelVersion: MODEL_VERSION,
      updatedAt: new Date().toISOString(),
      lambda,
      residualSd: Number.isFinite(residSd) ? residSd : 0,
      predictorKeys: [
        'bias',
        'affect_valence',
        'affect_arousal',
        'sleep_hours',
        'sleep_quality',
        'energy_level',
        'medication_taken',
        ...topFeatureIds,
      ],
      weights: w,
      weightVar,
      trainingN: train.length,
    }

    // Store eval metrics on the user node (separate from “production” model version)
    const driver = getNeo4jDriver()
    const { database } = getNeo4jConfig()
    const session = driver.session(database ? { database } : undefined)
    try {
      await storeUserCalibrationModel(userId, model)
      await session.run(
        `
        MATCH (u:User {userId: $userId})
        SET
          u.evalUpdatedAt = datetime(),
          u.evalNTrain = $nTrain,
          u.evalNTest = $nTest,
          u.evalMAE = $mae,
          u.evalCoverage80 = $coverage80,
          u.evalECE10 = $ece10
        `,
        {
          userId,
          nTrain: train.length,
          nTest: test.length,
          mae,
          coverage80,
          ece10,
        }
      )
    } finally {
      await session.close()
    }

    // eslint-disable-next-line no-console
    console.log(
      `${userId}: MAE=${mae.toFixed(2)} coverage80=${coverage80.toFixed(2)} ece10=${ece10.toFixed(2)} (n=${train.length}/${test.length})`
    )
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Neo4j eval failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeNeo4jDriver()
  })


