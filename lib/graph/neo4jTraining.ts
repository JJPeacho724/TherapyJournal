import { getNeo4jConfig, getNeo4jDriver } from '@/lib/neo4j'

export interface TrainingRow {
  entryId: string
  timestamp: string
  mood: number
  affectValence: number | null
  affectArousal: number | null
  sleepHours: number | null
  sleepQuality: number | null
  energyLevel: number | null
  medicationTaken: boolean | null
  featureIds: string[]
}

export async function fetchUserTrainingRows(userId: string): Promise<TrainingRow[]> {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  try {
    const res = await session.run(
      `
      MATCH (u:User {userId: $userId})-[:WROTE]->(e:Entry)
      MATCH (e)-[:HAS_SELF_REPORT]->(sr:SelfReport)
      OPTIONAL MATCH (e)-[:HAS_AFFECT]->(a:AffectPoint)
      OPTIONAL MATCH (e)-[:HAS_CONTEXT]->(c:ContextPoint)
      OPTIONAL MATCH (e)-[:MENTIONS]->(f:Feature)
      WITH e, sr, a, c, collect(distinct f.featureId) AS featureIds
      RETURN
        e.entryId AS entryId,
        toString(e.timestamp) AS timestamp,
        sr.mood AS mood,
        a.valence AS affectValence,
        a.arousal AS affectArousal,
        c.sleep_hours AS sleepHours,
        c.sleep_quality AS sleepQuality,
        c.energy_level AS energyLevel,
        c.medication_taken AS medicationTaken,
        featureIds AS featureIds
      ORDER BY e.timestamp ASC
      `,
      { userId }
    )

    return res.records.map((r) => ({
      entryId: r.get('entryId'),
      timestamp: r.get('timestamp'),
      mood: r.get('mood'),
      affectValence: r.get('affectValence') ?? null,
      affectArousal: r.get('affectArousal') ?? null,
      sleepHours: r.get('sleepHours') ?? null,
      sleepQuality: r.get('sleepQuality') ?? null,
      energyLevel: r.get('energyLevel') ?? null,
      medicationTaken: r.get('medicationTaken') ?? null,
      featureIds: (r.get('featureIds') as string[]) ?? [],
    })) as TrainingRow[]
  } finally {
    await session.close()
  }
}

export interface StoredCalibrationModel {
  modelVersion: string
  updatedAt: string
  lambda: number
  residualSd: number
  predictorKeys: string[] // includes base predictors + featureIds
  weights: number[] // same length
  weightVar: number[] // bootstrap var per weight (diagonal)
  trainingN: number
}

export async function storeUserCalibrationModel(userId: string, model: StoredCalibrationModel) {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  try {
    await session.run(
      `
      MERGE (u:User {userId: $userId})
      SET
        u.calibModelVersion = $modelVersion,
        u.calibUpdatedAt = datetime($updatedAt),
        u.calibLambda = $lambda,
        u.calibResidualSd = $residualSd,
        u.calibPredictorKeys = $predictorKeys,
        u.calibWeights = $weights,
        u.calibWeightVar = $weightVar,
        u.calibTrainingN = $trainingN
      RETURN u.userId AS userId
      `,
      {
        userId,
        modelVersion: model.modelVersion,
        updatedAt: model.updatedAt,
        lambda: model.lambda,
        residualSd: model.residualSd,
        predictorKeys: model.predictorKeys,
        weights: model.weights,
        weightVar: model.weightVar,
        trainingN: model.trainingN,
      }
    )
  } finally {
    await session.close()
  }
}

export async function loadUserCalibrationModel(userId: string): Promise<StoredCalibrationModel | null> {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  try {
    const res = await session.run(
      `
      MATCH (u:User {userId: $userId})
      RETURN
        u.calibModelVersion AS modelVersion,
        toString(u.calibUpdatedAt) AS updatedAt,
        u.calibLambda AS lambda,
        u.calibResidualSd AS residualSd,
        u.calibPredictorKeys AS predictorKeys,
        u.calibWeights AS weights,
        u.calibWeightVar AS weightVar,
        u.calibTrainingN AS trainingN
      `,
      { userId }
    )
    if (res.records.length === 0) return null
    const r = res.records[0]
    const modelVersion = r.get('modelVersion')
    if (!modelVersion) return null
    return {
      modelVersion,
      updatedAt: r.get('updatedAt'),
      lambda: r.get('lambda') ?? 0,
      residualSd: r.get('residualSd') ?? 0,
      predictorKeys: (r.get('predictorKeys') as string[]) ?? [],
      weights: (r.get('weights') as number[]) ?? [],
      weightVar: (r.get('weightVar') as number[]) ?? [],
      trainingN: r.get('trainingN') ?? 0,
    }
  } finally {
    await session.close()
  }
}






