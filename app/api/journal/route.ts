import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import type { CreateJournalRequest } from '@/types'

// GET /api/journal - List patient's journal entries
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const drafts = searchParams.get('drafts') === 'true'

    // Fetch entries with related data
    let query = supabase
      .from('journal_entries')
      .select(`
        *,
        structured_log:structured_logs(*),
        ai_extraction:ai_extractions(*)
      `)
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (!drafts) {
      query = query.eq('is_draft', false)
    }

    const { data: entries, error } = await query

    if (error) {
      console.error('Error fetching entries:', error)
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
    }

    // Transform the response to flatten single relations (handle both array and object returns)
    const transformedEntries = entries?.map(entry => ({
      ...entry,
      structured_log: Array.isArray(entry.structured_log) 
        ? entry.structured_log[0] || null 
        : entry.structured_log || null,
      ai_extraction: Array.isArray(entry.ai_extraction) 
        ? entry.ai_extraction[0] || null 
        : entry.ai_extraction || null,
    }))

    return NextResponse.json({ entries: transformedEntries })
  } catch (error) {
    console.error('Journal GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/journal - Create a new journal entry
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: CreateJournalRequest = await request.json()
    
    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    // Create journal entry
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        patient_id: user.id,
        content: body.content,
        is_draft: body.is_draft ?? false,
        shared_with_therapist: body.shared_with_therapist ?? false,
      })
      .select()
      .single()

    if (entryError) {
      console.error('Error creating entry:', entryError)
      return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    }

    // Create structured log if provided
    if (body.structured_log) {
      const { error: logError } = await supabase
        .from('structured_logs')
        .insert({
          entry_id: entry.id,
          ...body.structured_log,
        })

      if (logError) {
        console.error('Error creating structured log:', logError)
        // Don't fail the whole request, just log the error
      }
    }

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    console.error('Journal POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

