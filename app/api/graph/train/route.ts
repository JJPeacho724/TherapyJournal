import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ensureNeo4jSchema } from '@/lib/neo4jSchema'
import { trainAndStoreUserCalibrationModel } from '@/lib/graph/calibration'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/graph/train
// Trains/updates the per-user calibration model from self-report labels stored in Neo4j.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      lambda,
      maxFeatures,
      minTrainingN,
      bootstrapSamples,
    }: {
      lambda?: number
      maxFeatures?: number
      minTrainingN?: number
      bootstrapSamples?: number
    } = await request.json().catch(() => ({}))

    await ensureNeo4jSchema()

    const result = await trainAndStoreUserCalibrationModel(user.id, {
      lambda,
      maxFeatures,
      minTrainingN,
      bootstrapSamples,
    })

    return NextResponse.json({ result })
  } catch (error) {
    console.error('Graph train error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}






