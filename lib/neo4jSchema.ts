import neo4j from 'neo4j-driver'
import { getNeo4jConfig, getNeo4jDriver } from '@/lib/neo4j'

/**
 * Idempotent Neo4j schema setup:
 * - Uniqueness constraints
 * - Indexes (timestamp)
 * - Vector index for Entry embeddings
 */
export async function ensureNeo4jSchema() {
  const driver = getNeo4jDriver()
  const { database, entryEmbeddingDim, entryVectorIndex } = getNeo4jConfig()

  const session = driver.session(database ? { database } : undefined)
  try {
    // Constraints
    await session.run(`
      CREATE CONSTRAINT user_userId_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.userId IS UNIQUE
    `)
    await session.run(`
      CREATE CONSTRAINT entry_entryId_unique IF NOT EXISTS
      FOR (e:Entry) REQUIRE e.entryId IS UNIQUE
    `)
    await session.run(`
      CREATE CONSTRAINT selfReport_reportId_unique IF NOT EXISTS
      FOR (sr:SelfReport) REQUIRE sr.reportId IS UNIQUE
    `)
    await session.run(`
      CREATE CONSTRAINT affect_affectId_unique IF NOT EXISTS
      FOR (a:AffectPoint) REQUIRE a.affectId IS UNIQUE
    `)
    await session.run(`
      CREATE CONSTRAINT feature_featureId_unique IF NOT EXISTS
      FOR (f:Feature) REQUIRE f.featureId IS UNIQUE
    `)

    // Basic indexes
    await session.run(`
      CREATE INDEX entry_timestamp_idx IF NOT EXISTS
      FOR (e:Entry) ON (e.timestamp)
    `)

    // Vector index (Neo4j 5.x)
    // NOTE: entryEmbeddingDim must match the embedding model (1536 for text-embedding-3-small).
    await session.run(
      `
      CREATE VECTOR INDEX ${entryVectorIndex} IF NOT EXISTS
      FOR (e:Entry) ON (e.embedding)
      OPTIONS {
        indexConfig: {
          \`vector.dimensions\`: $dims,
          \`vector.similarity_function\`: 'cosine'
        }
      }
      `,
      { dims: neo4j.int(entryEmbeddingDim) }
    )
  } finally {
    await session.close()
  }
}


