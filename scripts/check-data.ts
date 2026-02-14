import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  console.log('🔍 Checking database...\n')

  // Check profiles
  const { data: profiles } = await supabase.from('profiles').select('id, role, full_name')
  console.log('📋 Profiles:', profiles)

  // Check entries
  const { data: entries, count } = await supabase
    .from('journal_entries')
    .select('id, patient_id, created_at', { count: 'exact' })
    .limit(3)
  console.log(`\n📝 Journal entries: ${count || entries?.length || 0} total`)
  if (entries?.length) console.log('   Sample:', entries)

  // Check AI extractions
  const { data: extractions } = await supabase
    .from('ai_extractions')
    .select('id, mood_score, anxiety_score')
    .limit(3)
  console.log(`\n🤖 AI Extractions sample:`, extractions)

  // Check auth users
  const { data: users } = await supabase.auth.admin.listUsers()
  console.log('\n👤 Auth users:')
  users?.users?.forEach(u => {
    console.log(`   - ${u.email} (${u.id.substring(0, 8)}...)`)
  })
}

check().catch(console.error)

