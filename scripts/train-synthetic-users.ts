/**
 * Train calibration models for synthetic users.
 *
 * Usage:
 *   npx tsx scripts/train-synthetic-users.ts
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

import { trainAndStoreUserCalibrationModel } from '../lib/graph/calibration'
import { getNeo4jDriver } from '../lib/neo4j'

const SYNTHETIC_USERS = [
  { id: '1f5da38e-5d8f-4aa0-8823-2b524ffd4ac9', name: 'kaggle_anxiety_0' },
  { id: 'c25c26a6-7252-4859-9a51-b3434fa256eb', name: 'kaggle_anxiety_1' },
]

async function main() {
  console.log('🏋️ Training calibration models for synthetic users…\n')

  for (const user of SYNTHETIC_USERS) {
    console.log(`  Training: ${user.name} (${user.id.substring(0, 8)}…)`)
    try {
      const result = await trainAndStoreUserCalibrationModel(user.id, {
        minTrainingN: 10,
      })

      if (result.trained) {
        const model = result.model!
        console.log(`    ✅ Trained!`)
        console.log(`       Predictors: ${model.predictorKeys.length}`)
        console.log(`       Training N: ${model.trainingN}`)
        console.log(`       Residual SD: ${model.residualSd.toFixed(3)}`)
        console.log(`       Lambda: ${model.lambda}`)
      } else {
        console.log(`    ⚠️  Not trained: ${result.reason}`)
      }
    } catch (err: any) {
      console.error(`    ❌ Error: ${err.message}`)
    }
    console.log('')
  }

  // Close Neo4j driver
  try {
    const driver = getNeo4jDriver()
    await driver.close()
  } catch {}

  console.log('Done!')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
