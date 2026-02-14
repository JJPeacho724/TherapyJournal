import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkQuery() {
  const patientId = '8f4b7bb7-161e-4060-bb7b-f8cf816a7241' // Julian's ID

  // Same query as dashboard
  const { data: entries, error } = await supabase
    .from('journal_entries')
    .select(`
      id,
      created_at,
      content,
      ai_extraction:ai_extractions(mood_score, anxiety_score, emotions, symptoms),
      structured_log:structured_logs(sleep_hours)
    `)
    .eq('patient_id', patientId)
    .eq('is_draft', false)
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    console.log('❌ Query error:', error)
    return
  }

  console.log('📊 Query result structure:')
  entries?.forEach((entry, i) => {
    console.log(`\nEntry ${i + 1}:`)
    console.log('  ai_extraction type:', typeof entry.ai_extraction)
    console.log('  ai_extraction is array:', Array.isArray(entry.ai_extraction))
    console.log('  ai_extraction value:', JSON.stringify(entry.ai_extraction, null, 2))
    console.log('  structured_log type:', typeof entry.structured_log)
    console.log('  structured_log is array:', Array.isArray(entry.structured_log))
    console.log('  structured_log value:', JSON.stringify(entry.structured_log, null, 2))
  })

  // Also check if the related data exists directly
  console.log('\n\n📋 Direct query to ai_extractions:')
  const { data: extractions } = await supabase
    .from('ai_extractions')
    .select('entry_id, mood_score')
    .limit(3)
  console.log(extractions)

  console.log('\n📋 Direct query to structured_logs:')
  const { data: logs } = await supabase
    .from('structured_logs')
    .select('entry_id, sleep_hours')
    .limit(3)
  console.log(logs)
}

checkQuery()

