import { getNeo4jConfig, getNeo4jDriver } from '@/lib/neo4j'

export interface RetrieveEpisodesInput {
  userId: string
  embedding: number[]
  limit: number
  withinDays?: number
  excludeEntryId?: string
}

export interface RetrievedEpisode {
  entry: {
    entryId: string
    timestamp: string
    text?: string
    source?: string
    similarity: number
  }
  selfReport?: {
    reportId: string
    timestamp: string
    mood: number
    valence?: number | null
    arousal?: number | null
    confidence?: number | null
  } | null
  affect?: {
    affectId: string
    valence?: number | null
    arousal?: number | null
    dominance?: number | null
    modelVersion?: string | null
    computedAt?: string | null
  } | null
  prev?: { entryId: string; timestamp: string } | null
  next?: { entryId: string; timestamp: string } | null
  features: Array<{
    featureId: string
    type: string
    name: string
    mention?: Record<string, unknown>
    association?: Record<string, unknown> | null
  }>
}

export async function retrieveSimilarEpisodes(input: RetrieveEpisodesInput): Promise<RetrievedEpisode[]> {
  const driver = getNeo4jDriver()
  const { database, entryVectorIndex } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  const withinDays = input.withinDays ?? 180

  try {
    const res = await session.run(
      `
      MATCH (u:User {userId: $userId})
      CALL db.index.vector.queryNodes($indexName, toInteger($k), $embedding)
      YIELD node, score
      WITH u, node AS e, score
      WHERE (u)-[:WROTE]->(e)
        AND e.timestamp >= datetime() - duration({days: $withinDays})
        AND ($excludeEntryId IS NULL OR e.entryId <> $excludeEntryId)

      OPTIONAL MATCH (e)-[:HAS_SELF_REPORT]->(sr:SelfReport)
      OPTIONAL MATCH (e)-[:HAS_AFFECT]->(a:AffectPoint)
      OPTIONAL MATCH (prev:Entry)-[:NEXT]->(e)
      OPTIONAL MATCH (e)-[:NEXT]->(next:Entry)
      OPTIONAL MATCH (e)-[m:MENTIONS]->(f:Feature)
      OPTIONAL MATCH (u)-[assoc:ASSOCIATED_WITH]->(f)

      WITH e, score, sr, a, prev, next,
           collect(distinct {
             featureId: f.featureId,
             type: f.type,
             name: f.name,
             mention: properties(m),
             association: properties(assoc)
           }) AS features

      RETURN {
        entry: {
          entryId: e.entryId,
          timestamp: toString(e.timestamp),
          text: e.text,
          source: e.source,
          similarity: score
        },
        selfReport: CASE WHEN sr IS NULL THEN NULL ELSE {
          reportId: sr.reportId,
          timestamp: toString(sr.timestamp),
          mood: sr.mood,
          valence: sr.valence,
          arousal: sr.arousal,
          confidence: sr.confidence
        } END,
        affect: CASE WHEN a IS NULL THEN NULL ELSE {
          affectId: a.affectId,
          valence: a.valence,
          arousal: a.arousal,
          dominance: a.dominance,
          modelVersion: a.modelVersion,
          computedAt: toString(a.computedAt)
        } END,
        prev: CASE WHEN prev IS NULL THEN NULL ELSE { entryId: prev.entryId, timestamp: toString(prev.timestamp) } END,
        next: CASE WHEN next IS NULL THEN NULL ELSE { entryId: next.entryId, timestamp: toString(next.timestamp) } END,
        features: features
      } AS episode
      ORDER BY episode.entry.similarity DESC
      LIMIT toInteger($k)
      `,
      {
        userId: input.userId,
        embedding: input.embedding,
        k: input.limit,
        withinDays,
        indexName: entryVectorIndex,
        excludeEntryId: input.excludeEntryId ?? null,
      }
    )

    return res.records.map((r) => r.get('episode')) as RetrievedEpisode[]
  } finally {
    await session.close()
  }
}

export interface UserFeatureAssociation {
  featureId: string
  type: string
  name: string
  effectMean: number
  effectSd: number
  supportN: number
  target: string
  lagDays: number
  lastUpdatedAt: string
}

export async function retrieveUserFeatureAssociations(
  userId: string,
  limit: number = 10
): Promise<UserFeatureAssociation[]> {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  try {
    const res = await session.run(
      `
      MATCH (u:User {userId: $userId})-[r:ASSOCIATED_WITH]->(f:Feature)
      WHERE r.target = 'mood' AND r.lagDays = 0
      RETURN {
        featureId: f.featureId,
        type: f.type,
        name: f.name,
        effectMean: r.effectMean,
        effectSd: r.effectSd,
        supportN: r.supportN,
        target: r.target,
        lagDays: r.lagDays,
        lastUpdatedAt: toString(r.lastUpdatedAt)
      } AS association
      ORDER BY abs(association.effectMean) DESC
      LIMIT $limit
      `,
      { userId, limit }
    )

    return res.records.map((r) => r.get('association')) as UserFeatureAssociation[]
  } finally {
    await session.close()
  }
}

// ─── Rich personal context for prompt personalization ───

export interface RecentEntryContext {
  entryId: string
  timestamp: string
  textExcerpt: string
  mood: number | null
  emotions: string[]
  triggers: string[]
  symptoms: string[]
}

export interface FeatureFrequency {
  name: string
  type: string
  count: number
  lastSeen: string
}

export interface MoodDataPoint {
  timestamp: string
  mood: number
}

export interface RichUserContext {
  recentEntries: RecentEntryContext[]
  topFeatures: FeatureFrequency[]
  moodTrajectory: MoodDataPoint[]
  featureAssociations: UserFeatureAssociation[]
}

/**
 * Retrieve rich personal context from Neo4j for question personalization.
 * Fetches recent entries with their text/emotions, top recurring themes,
 * and mood trajectory — giving the AI real personal details to reference.
 */
export async function retrieveRichUserContext(
  userId: string,
  opts: { recentEntryCount?: number; featureLimit?: number; moodDays?: number } = {}
): Promise<RichUserContext> {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  const recentEntryCount = opts.recentEntryCount ?? 7
  const featureLimit = opts.featureLimit ?? 15
  const moodDays = opts.moodDays ?? 30

  try {
    // 1. Recent entries with text, mood, and features
    const entriesRes = await session.run(
      `
      MATCH (u:User {userId: $userId})-[:WROTE]->(e:Entry)
      WHERE e.timestamp >= datetime() - duration({days: $moodDays})
      OPTIONAL MATCH (e)-[:HAS_SELF_REPORT]->(sr:SelfReport)
      OPTIONAL MATCH (e)-[:MENTIONS]->(f:Feature)
      WITH e, sr,
           collect(CASE WHEN f.type IN ['Theme'] THEN f.name ELSE NULL END) AS emotions,
           collect(CASE WHEN f.type = 'Stressor' THEN f.name ELSE NULL END) AS triggers,
           collect(CASE WHEN f.type = 'Symptom' THEN f.name ELSE NULL END) AS symptoms
      RETURN {
        entryId: e.entryId,
        timestamp: toString(e.timestamp),
        textExcerpt: left(e.text, 300),
        mood: sr.mood,
        emotions: [x IN emotions WHERE x IS NOT NULL],
        triggers: [x IN triggers WHERE x IS NOT NULL],
        symptoms: [x IN symptoms WHERE x IS NOT NULL]
      } AS entry
      ORDER BY e.timestamp DESC
      LIMIT toInteger($limit)
      `,
      { userId, moodDays, limit: recentEntryCount }
    )

    const recentEntries = entriesRes.records.map((r) => r.get('entry')) as RecentEntryContext[]

    // 2. Top recurring features (themes, stressors, symptoms) with frequency
    const featuresRes = await session.run(
      `
      MATCH (u:User {userId: $userId})-[:WROTE]->(e:Entry)-[:MENTIONS]->(f:Feature)
      WHERE e.timestamp >= datetime() - duration({days: $moodDays})
      WITH f.name AS name, f.type AS type, count(e) AS cnt,
           max(toString(e.timestamp)) AS lastSeen
      RETURN {
        name: name,
        type: type,
        count: cnt,
        lastSeen: lastSeen
      } AS feature
      ORDER BY cnt DESC
      LIMIT toInteger($limit)
      `,
      { userId, moodDays, limit: featureLimit }
    )

    const topFeatures = featuresRes.records.map((r) => r.get('feature')) as FeatureFrequency[]

    // 3. Mood trajectory (recent self-reports)
    const moodRes = await session.run(
      `
      MATCH (u:User {userId: $userId})-[:WROTE]->(e:Entry)-[:HAS_SELF_REPORT]->(sr:SelfReport)
      WHERE e.timestamp >= datetime() - duration({days: $moodDays})
      RETURN {
        timestamp: toString(e.timestamp),
        mood: sr.mood
      } AS point
      ORDER BY e.timestamp ASC
      `,
      { userId, moodDays }
    )

    const moodTrajectory = moodRes.records.map((r) => r.get('point')) as MoodDataPoint[]

    // 4. Feature associations (same as before but with lower threshold)
    const assocRes = await session.run(
      `
      MATCH (u:User {userId: $userId})-[r:ASSOCIATED_WITH]->(f:Feature)
      WHERE r.target = 'mood' AND r.lagDays = 0
      RETURN {
        featureId: f.featureId,
        type: f.type,
        name: f.name,
        effectMean: r.effectMean,
        effectSd: r.effectSd,
        supportN: r.supportN,
        target: r.target,
        lagDays: r.lagDays,
        lastUpdatedAt: toString(r.lastUpdatedAt)
      } AS association
      ORDER BY abs(association.effectMean) DESC
      LIMIT 10
      `,
      { userId }
    )

    const featureAssociations = assocRes.records.map((r) => r.get('association')) as UserFeatureAssociation[]

    return { recentEntries, topFeatures, moodTrajectory, featureAssociations }
  } finally {
    await session.close()
  }
}


