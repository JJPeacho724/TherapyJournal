import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { JournalCard } from '@/components/journal'
import { Button, Card } from '@/components/ui'
import type { JournalEntry } from '@/types'

export default async function JournalListPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createServerSupabaseClient()

  const { data: entries } = await supabase
    .from('journal_entries')
    .select(`
      *,
      structured_log:structured_logs(*),
      ai_extraction:ai_extractions(*)
    `)
    .eq('patient_id', profile.id)
    .eq('is_draft', false)
    .order('created_at', { ascending: false })
    .limit(20)

  const journalEntries: JournalEntry[] = (entries || []).map(entry => ({
    ...entry,
    structured_log: Array.isArray(entry.structured_log)
      ? entry.structured_log[0] || null
      : entry.structured_log || null,
    ai_extraction: Array.isArray(entry.ai_extraction)
      ? entry.ai_extraction[0] || null
      : entry.ai_extraction || null,
  }))

  const firstName = profile.full_name?.split(' ')[0]

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-normal text-therapy-text mb-2">
          Your thoughts
        </h1>
        <p className="text-therapy-muted">
          {journalEntries.length === 0
            ? 'A place for your reflections'
            : `${journalEntries.length} ${journalEntries.length === 1 ? 'entry' : 'entries'} so far`
          }
        </p>
      </div>

      {/* New Entry Button */}
      <div className="flex justify-center mb-8">
        <Link href="/journal/new">
          <Button size="lg">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Write something new
          </Button>
        </Link>
      </div>

      {/* Entries List */}
      {journalEntries.length === 0 ? (
        <Card className="text-center py-12 bg-white/80">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-sage-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-sage-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h3 className="text-lg font-normal text-therapy-text mb-2">
            Your journal is waiting
          </h3>
          <p className="text-therapy-muted mb-6 max-w-sm mx-auto text-sm">
            Writing regularly can help you understand your thoughts and feelings better.
          </p>
          <Link href="/journal/new">
            <Button>Write your first entry</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {journalEntries.map((entry) => (
            <JournalCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Back to dashboard */}
      <div className="mt-10 text-center">
        <Link
          href="/dashboard"
          className="text-sm text-therapy-muted hover:text-therapy-text transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
