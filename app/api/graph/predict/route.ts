import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ensureNeo4jSchema } from '@/lib/neo4jSchema'
import { predictCalibratedMood } from '@/lib/graph/calibration'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/graph/predict
// Predicts calibrated mood for an existing Entry (preferred) or raw text.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      entryId,
      text,
      limit = 20,
      withinDays = 180,
    }: { entryId?: string; text?: string; limit?: number; withinDays?: number } = await request.json()

    if (!entryId && (!text || text.trim().length === 0)) {
      return NextResponse.json({ error: 'entryId or text is required' }, { status: 400 })
    }

    await ensureNeo4jSchema()

    const prediction = await predictCalibratedMood({
      userId: user.id,
      entryId,
      text,
      limit: Math.min(Math.max(limit, 1), 50),
      withinDays: Math.min(Math.max(withinDays, 1), 3650),
    })

    return NextResponse.json({ prediction })
  } catch (error) {
    console.error('Graph predict error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}






