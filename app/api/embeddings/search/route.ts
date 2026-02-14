import { createServerSupabaseClient } from '@/lib/supabase-server'
import { searchSimilarEntries } from '@/lib/embeddings'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/embeddings/search - Semantic search past entries
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query, limit = 5 } = await request.json()

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const results = await searchSimilarEntries(user.id, query, limit)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Embedding search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

