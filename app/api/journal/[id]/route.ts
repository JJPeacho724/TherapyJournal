import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import type { UpdateJournalRequest } from '@/types'

// GET /api/journal/[id] - Get a single journal entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch entry with related data
    const { data: entry, error } = await supabase
      .from('journal_entries')
      .select(`
        *,
        structured_log:structured_logs(*),
        ai_extraction:ai_extractions(*)
      `)
      .eq('id', id)
      .eq('patient_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
      }
      console.error('Error fetching entry:', error)
      return NextResponse.json({ error: 'Failed to fetch entry' }, { status: 500 })
    }

    // Transform the response (handle both array and object returns)
    const transformedEntry = {
      ...entry,
      structured_log: Array.isArray(entry.structured_log) 
        ? entry.structured_log[0] || null 
        : entry.structured_log || null,
      ai_extraction: Array.isArray(entry.ai_extraction) 
        ? entry.ai_extraction[0] || null 
        : entry.ai_extraction || null,
    }

    return NextResponse.json({ entry: transformedEntry })
  } catch (error) {
    console.error('Journal GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/journal/[id] - Update a journal entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: UpdateJournalRequest = await request.json()

    // Update journal entry
    const updateData: Record<string, unknown> = {}
    if (body.content !== undefined) updateData.content = body.content
    if (body.is_draft !== undefined) updateData.is_draft = body.is_draft
    if (body.shared_with_therapist !== undefined) updateData.shared_with_therapist = body.shared_with_therapist

    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .update(updateData)
      .eq('id', id)
      .eq('patient_id', user.id)
      .select()
      .single()

    if (entryError) {
      if (entryError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
      }
      console.error('Error updating entry:', entryError)
      return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
    }

    // Update structured log if provided
    if (body.structured_log) {
      // Check if structured log exists
      const { data: existingLog } = await supabase
        .from('structured_logs')
        .select('id')
        .eq('entry_id', id)
        .single()

      if (existingLog) {
        await supabase
          .from('structured_logs')
          .update(body.structured_log)
          .eq('entry_id', id)
      } else {
        await supabase
          .from('structured_logs')
          .insert({
            entry_id: id,
            ...body.structured_log,
          })
      }
    }

    return NextResponse.json({ entry })
  } catch (error) {
    console.error('Journal PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/journal/[id] - Delete a journal entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete entry (cascade will handle related records)
    const { error } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', id)
      .eq('patient_id', user.id)

    if (error) {
      console.error('Error deleting entry:', error)
      return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Journal DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

