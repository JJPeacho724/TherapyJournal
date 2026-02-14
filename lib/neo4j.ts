import neo4j, { Driver } from 'neo4j-driver'

let driver: Driver | null = null

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} environment variable is not set`)
  return v
}

export function getNeo4jConfig() {
  const uri = requiredEnv('NEO4J_URI')
  const user = requiredEnv('NEO4J_USER')
  const password = requiredEnv('NEO4J_PASSWORD')
  const database = process.env.NEO4J_DATABASE
  const entryEmbeddingDim = parseInt(process.env.NEO4J_ENTRY_EMBEDDING_DIM || '1536', 10)
  const entryVectorIndex = process.env.NEO4J_ENTRY_VECTOR_INDEX || 'entry_embedding_index'

  if (!Number.isFinite(entryEmbeddingDim) || entryEmbeddingDim <= 0) {
    throw new Error('NEO4J_ENTRY_EMBEDDING_DIM must be a positive integer')
  }

  return { uri, user, password, database, entryEmbeddingDim, entryVectorIndex }
}

export function getNeo4jDriver(): Driver {
  if (driver) return driver

  const { uri, user, password } = getNeo4jConfig()
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  return driver
}

export async function closeNeo4jDriver() {
  if (!driver) return
  await driver.close()
  driver = null
}






