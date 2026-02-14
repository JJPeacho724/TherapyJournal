import dotenv from 'dotenv'
import { ensureNeo4jSchema } from '@/lib/neo4jSchema'
import { closeNeo4jDriver } from '@/lib/neo4j'

// Prefer Next.js-style env file for local dev, then fall back to .env
dotenv.config({ path: '.env.local' })
dotenv.config()

async function main() {
  await ensureNeo4jSchema()
  // eslint-disable-next-line no-console
  console.log('Neo4j schema ensured.')
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Neo4j schema setup failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeNeo4jDriver()
  })


