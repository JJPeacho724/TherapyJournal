import { createEmbedding } from '@/lib/openai'
import { retrieveSimilarEpisodes } from '@/lib/graph/neo4jRetrieve'
import { fetchUserTrainingRows, loadUserCalibrationModel, storeUserCalibrationModel, type StoredCalibrationModel } from '@/lib/graph/neo4jTraining'
import { clamp, mean, ridgeRegression, variance } from '@/lib/graph/math'
import { getNeo4jConfig, getNeo4jDriver } from '@/lib/neo4j'

const MODEL_VERSION = 'calib_ridge_bootstrap_v1'

type PredictorVector = {
  affectValence: number
  affectArousal: number
  sleepHours: number
  sleepQuality: number
  energyLevel: number
  medicationTaken: number
  featureIds: Set<string>
}

function toPredictorVector(row: {
  affectValence: number | null
  affectArousal: number | null
  sleepHours: number | null
  sleepQuality: number | null
  energyLevel: number | null
  medicationTaken: boolean | null
  featureIds: string[]
}): PredictorVector {
  const sleepHours = row.sleepHours ?? 0
  const sleepQuality = row.sleepQuality ?? 0
  const energyLevel = row.energyLevel ?? 0

  // Scale continuous context into 0..1-ish range
  const sleepHoursScaled = clamp(sleepHours / 12, 0, 1)
  const sleepQualityScaled = clamp(sleepQuality / 10, 0, 1)
  const energyLevelScaled = clamp(energyLevel / 10, 0, 1)

  return {
    affectValence: row.affectValence ?? 0,
    affectArousal: row.affectArousal ?? 0,
    sleepHours: sleepHoursScaled,
    sleepQuality: sleepQualityScaled,
    energyLevel: energyLevelScaled,
    medicationTaken: row.medicationTaken ? 1 : 0,
    featureIds: new Set(row.featureIds ?? []),
  }
}

function buildPredictorKeys(featureIds: string[]): string[] {
  return [
    'bias',
    'affect_valence',
    'affect_arousal',
    'sleep_hours',
    'sleep_quality',
    'energy_level',
    'medication_taken',
    ...featureIds,
  ]
}

function vectorize(p: PredictorVector, featureIds: string[]): number[] {
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

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * (b[i] ?? 0)
  return s
}

function sampleWithReplacement(n: number): number[] {
  const idx: number[] = new Array(n)
  for (let i = 0; i < n; i++) idx[i] = Math.floor(Math.random() * n)
  return idx
}

export interface TrainOptions {
  lambda?: number
  maxFeatures?: number
  minTrainingN?: number
  bootstrapSamples?: number
}

export async function trainAndStoreUserCalibrationModel(userId: string, opts: TrainOptions = {}) {
  const lambda = opts.lambda ?? 1.0
  const maxFeatures = opts.maxFeatures ?? 120
  const minTrainingN = opts.minTrainingN ?? 10
  const bootstrapSamples = opts.bootstrapSamples ?? 100

  const rows = await fetchUserTrainingRows(userId)
  if (rows.length < minTrainingN) {
    return { trained: false, reason: `Need at least ${minTrainingN} labeled days; have ${rows.length}.` }
  }

  // Build user-specific vocabulary of featureIds (top by frequency)
  const freq = new Map<string, number>()
  for (const r of rows) {
    for (const fid of r.featureIds ?? []) freq.set(fid, (freq.get(fid) ?? 0) + 1)
  }
  const topFeatureIds = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFeatures)
    .map(([fid]) => fid)

  const predictors = rows.map((r) => toPredictorVector(r))
  const X = predictors.map((p) => vectorize(p, topFeatureIds))
  const y = rows.map((r) => r.mood)

  const weights = ridgeRegression(X, y, lambda)
  const yHat = X.map((x) => dot(weights, x))
  const residuals = y.map((yi, i) => yi - yHat[i])
  const residualSd = Math.sqrt(variance(residuals))

  // Bootstrap diagonal variance of weights
  const p = weights.length
  const wSamples: number[][] = []
  for (let b = 0; b < bootstrapSamples; b++) {
    const idx = sampleWithReplacement(rows.length)
    const Xb = idx.map((i) => X[i])
    const yb = idx.map((i) => y[i])
    wSamples.push(ridgeRegression(Xb, yb, lambda))
  }
  const weightVar = new Array(p).fill(0)
  for (let j = 0; j < p; j++) {
    const vals = wSamples.map((w) => w[j] ?? 0)
    weightVar[j] = variance(vals)
  }

  const model: StoredCalibrationModel = {
    modelVersion: MODEL_VERSION,
    updatedAt: new Date().toISOString(),
    lambda,
    residualSd: Number.isFinite(residualSd) ? residualSd : 0,
    predictorKeys: buildPredictorKeys(topFeatureIds),
    weights,
    weightVar,
    trainingN: rows.length,
  }

  await storeUserCalibrationModel(userId, model)

  // Also materialize feature association stats from the model weights (lag 0 only in v1)
  // Stored as stats (not causal claims) on (u)-[:ASSOCIATED_WITH]->(f).
  await upsertLag0AssociationsFromModel(userId, topFeatureIds, model)

  return { trained: true, model }
}

async function upsertLag0AssociationsFromModel(userId: string, featureIds: string[], model: StoredCalibrationModel) {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  // feature weight indices start after base predictors:
  // bias, affect_valence, affect_arousal, sleep_hours, sleep_quality, energy_level, medication_taken
  const baseLen = 7

  try {
    for (let i = 0; i < featureIds.length; i++) {
      const fid = featureIds[i]
      const wIdx = baseLen + i
      const effectMean = model.weights[wIdx] ?? 0
      const effectSd = Math.sqrt(model.weightVar[wIdx] ?? 0)

      await session.run(
        `
        MATCH (u:User {userId: $userId})
        MERGE (f:Feature {featureId: $featureId})
        MERGE (u)-[r:ASSOCIATED_WITH {target: 'mood', lagDays: 0}]->(f)
        SET
          r.effectMean = $effectMean,
          r.effectSd = $effectSd,
          r.supportN = $supportN,
          r.lastUpdatedAt = datetime(),
          r.method = $method
        `,
        {
          userId,
          featureId: fid,
          effectMean,
          effectSd,
          supportN: null,
          method: MODEL_VERSION,
        }
      )
    }
  } finally {
    await session.close()
  }
}

export interface PredictInput {
  userId: string
  entryId?: string
  text?: string
  limit?: number
  withinDays?: number
}

export interface MoodPrediction {
  mean: number
  sd: number
  alpha: number
  model?: { mean: number; sd: number; trainingN: number } | null
  retrieved?: { mean: number; sd: number; supportN: number } | null
  episodes: Array<{ entryId: string; timestamp: string; similarity: number; mood?: number | null }>
}

async function fetchEntryPredictors(userId: string, entryId: string): Promise<{
  embedding: number[]
  predictors: PredictorVector
  timestamp: string
}> {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  try {
    const res = await session.run(
      `
      MATCH (u:User {userId: $userId})-[:WROTE]->(e:Entry {entryId: $entryId})
      OPTIONAL MATCH (e)-[:HAS_AFFECT]->(a:AffectPoint)
      OPTIONAL MATCH (e)-[:HAS_CONTEXT]->(c:ContextPoint)
      OPTIONAL MATCH (e)-[:MENTIONS]->(f:Feature)
      RETURN
        e.embedding AS embedding,
        toString(e.timestamp) AS timestamp,
        a.valence AS affectValence,
        a.arousal AS affectArousal,
        c.sleep_hours AS sleepHours,
        c.sleep_quality AS sleepQuality,
        c.energy_level AS energyLevel,
        c.medication_taken AS medicationTaken,
        collect(distinct f.featureId) AS featureIds
      `,
      { userId, entryId }
    )
    if (res.records.length === 0) {
      throw new Error('Entry not found in graph for user')
    }
    const r = res.records[0]
    const embedding = (r.get('embedding') as number[]) ?? []
    const timestamp = r.get('timestamp')
    const predictors = toPredictorVector({
      affectValence: r.get('affectValence') ?? null,
      affectArousal: r.get('affectArousal') ?? null,
      sleepHours: r.get('sleepHours') ?? null,
      sleepQuality: r.get('sleepQuality') ?? null,
      energyLevel: r.get('energyLevel') ?? null,
      medicationTaken: r.get('medicationTaken') ?? null,
      featureIds: (r.get('featureIds') as string[]) ?? [],
    })
    return { embedding, predictors, timestamp }
  } finally {
    await session.close()
  }
}

function computeModelPrediction(model: StoredCalibrationModel, p: PredictorVector): { mean: number; sd: number } {
  const keys = model.predictorKeys
  const featureIds = keys.slice(7) // after base predictors + bias
  const x = vectorize(p, featureIds)
  const mu = dot(model.weights, x)
  const varDiag = model.weightVar ?? []
  let varPred = (model.residualSd ?? 0) ** 2
  for (let i = 0; i < x.length; i++) varPred += (x[i] ** 2) * (varDiag[i] ?? 0)
  return { mean: mu, sd: Math.sqrt(Math.max(0, varPred)) }
}

function computeRetrievedEstimate(episodes: Array<{ similarity: number; mood: number }>) {
  if (episodes.length === 0) return null
  const ws = episodes.map((e) => Math.max(0, e.similarity))
  const wSum = ws.reduce((a, b) => a + b, 0)
  if (wSum <= 0) return null
  const mu = episodes.reduce((acc, e, i) => acc + ws[i] * e.mood, 0) / wSum
  // Weighted variance around mu (conservative)
  const varW =
    episodes.reduce((acc, e, i) => acc + ws[i] * (e.mood - mu) * (e.mood - mu), 0) / wSum
  return { mean: mu, sd: Math.sqrt(Math.max(0, varW)), supportN: episodes.length }
}

export async function predictCalibratedMood(input: PredictInput): Promise<MoodPrediction> {
  const limit = input.limit ?? 20
  const withinDays = input.withinDays ?? 180

  // 1) Get embedding + predictors for the entry (preferred) or raw text.
  let embedding: number[]
  let predictors: PredictorVector
  let entryTimestamp: string
  let excludeEntryId: string | null = null

  if (input.entryId) {
    const fetched = await fetchEntryPredictors(input.userId, input.entryId)
    embedding = fetched.embedding
    predictors = fetched.predictors
    entryTimestamp = fetched.timestamp
    excludeEntryId = input.entryId
  } else if (input.text) {
    embedding = await createEmbedding(input.text)
    predictors = toPredictorVector({
      affectValence: null,
      affectArousal: null,
      sleepHours: null,
      sleepQuality: null,
      energyLevel: null,
      medicationTaken: null,
      featureIds: [],
    })
    entryTimestamp = new Date().toISOString()
  } else {
    throw new Error('Must provide entryId or text')
  }

  // 2) Retrieve similar labeled episodes for this user.
  const episodes = await retrieveSimilarEpisodes({
    userId: input.userId,
    embedding,
    limit,
    withinDays,
    excludeEntryId: excludeEntryId ?? undefined,
  })

  const labeledNeighbors = episodes
    .map((e) => ({ similarity: e.entry.similarity, mood: e.selfReport?.mood }))
    .filter((x): x is { similarity: number; mood: number } => typeof x.mood === 'number')

  const retrieved = computeRetrievedEstimate(labeledNeighbors)

  // 3) Base calibrated model prediction (if trained).
  const model = await loadUserCalibrationModel(input.userId)
  const modelPred = model ? computeModelPrediction(model, predictors) : null

  // 4) Blend.
  const support = retrieved?.supportN ?? 0
  const alpha = clamp(0.8 - 0.05 * support, 0.3, 0.8)

  const muModel = modelPred?.mean ?? (retrieved?.mean ?? 5)
  const sdModel = modelPred?.sd ?? (retrieved?.sd ?? 2)
  const muRetr = retrieved?.mean ?? muModel
  const sdRetr = retrieved?.sd ?? sdModel

  const mu = alpha * muModel + (1 - alpha) * muRetr
  const varianceBlend =
    alpha * alpha * sdModel * sdModel +
    (1 - alpha) * (1 - alpha) * sdRetr * sdRetr +
    0.25 * (muModel - muRetr) * (muModel - muRetr)
  const sd = Math.sqrt(Math.max(0, varianceBlend))

  return {
    mean: mu,
    sd,
    alpha,
    model: model ? { mean: muModel, sd: sdModel, trainingN: model.trainingN } : null,
    retrieved: retrieved ? { mean: muRetr, sd: sdRetr, supportN: support } : null,
    episodes: episodes.map((e) => ({
      entryId: e.entry.entryId,
      timestamp: e.entry.timestamp,
      similarity: e.entry.similarity,
      mood: e.selfReport?.mood ?? null,
    })),
  }
}


