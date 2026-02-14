import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createEmbedding } from '@/lib/openai'
import { retrieveSimilarEpisodes } from '@/lib/graph/neo4jRetrieve'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/graph/retrieve
// Hybrid retrieval: embedding → Neo4j vector index → graph expansion (features, neighbors, labels, associations)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      query,
      limit = 10,
      withinDays = 180,
    }: { query: string; limit?: number; withinDays?: number } = await request.json()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const embedding = await createEmbedding(query)
    const episodes = await retrieveSimilarEpisodes({
      userId: user.id,
      embedding,
      limit: Math.min(Math.max(limit, 1), 50),
      withinDays: Math.min(Math.max(withinDays, 1), 3650),
    })

    return NextResponse.json({ episodes })
  } catch (error) {
    console.error('Graph retrieve error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}






