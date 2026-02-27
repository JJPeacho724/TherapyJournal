/**
 * Demo Cohort Seed Script
 *
 * Creates a full demo cohort matching the IOP/PHP showcase spec:
 *   - 2 clinician accounts, 1 admin account
 *   - 5 patients with distinct clinical trajectories
 *   - 10-14 days of journal entries per patient
 *   - Pre-computed EWMA baselines and synthetic AI extractions
 *
 * Usage:
 *   npm run seed:cohort
 *   npx tsx scripts/seed-demo-cohort.ts
 *
 * Requires:
 *   SUPABASE_SERVICE_ROLE_KEY   (Supabase Dashboard → Settings → API)
 *   NEXT_PUBLIC_SUPABASE_URL
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Accounts ──

interface AccountSpec {
  email: string
  password: string
  fullName: string
  role: 'patient' | 'therapist' | 'admin'
}

const CLINICIANS: AccountSpec[] = [
  { email: 'demo.clinician1@therapyjournal.local', password: 'DemoClinician1!', fullName: 'Dr. Sarah Chen', role: 'therapist' },
  { email: 'demo.clinician2@therapyjournal.local', password: 'DemoClinician2!', fullName: 'Dr. Marcus Rivera', role: 'therapist' },
]

const ADMIN: AccountSpec = {
  email: 'demo.admin@therapyjournal.local',
  password: 'DemoAdmin1!',
  fullName: 'Admin User',
  role: 'admin',
}

// ── Patient Archetypes ──

interface PatientSpec {
  email: string
  password: string
  fullName: string
  archetype: string
  description: string
  days: number
  moodCurve: (day: number, total: number) => number
  anxietyCurve: (day: number, total: number) => number
  assignedClinician: number // index into CLINICIANS
}

const PATIENTS: PatientSpec[] = [
  {
    email: 'demo.patient1@therapyjournal.local',
    password: 'DemoPatient1!',
    fullName: 'Alex Thompson',
    archetype: 'steady_improvement',
    description: 'Steady improvement over treatment',
    days: 14,
    moodCurve: (d, t) => 3.5 + (3.5 * d) / t,
    anxietyCurve: (d, t) => 7 - (3.5 * d) / t,
    assignedClinician: 0,
  },
  {
    email: 'demo.patient2@therapyjournal.local',
    password: 'DemoPatient2!',
    fullName: 'Jordan Lee',
    archetype: 'high_volatility',
    description: 'High volatility with wide mood swings',
    days: 14,
    moodCurve: (d) => 5 + 3 * Math.sin((d / 3) * Math.PI),
    anxietyCurve: (d) => 5 + 2.5 * Math.cos((d / 3) * Math.PI),
    assignedClinician: 0,
  },
  {
    email: 'demo.patient3@therapyjournal.local',
    password: 'DemoPatient3!',
    fullName: 'Casey Morgan',
    archetype: 'plateau_then_improvement',
    description: 'Plateau followed by late-stage improvement',
    days: 14,
    moodCurve: (d, t) => {
      if (d < t * 0.6) return 4.5
      return 4.5 + (3 * (d - t * 0.6)) / (t * 0.4)
    },
    anxietyCurve: (d, t) => {
      if (d < t * 0.6) return 6
      return 6 - (2.5 * (d - t * 0.6)) / (t * 0.4)
    },
    assignedClinician: 1,
  },
  {
    email: 'demo.patient4@therapyjournal.local',
    password: 'DemoPatient4!',
    fullName: 'Riley Kim',
    archetype: 'gradual_decline',
    description: 'Gradual decline — system should capture this',
    days: 12,
    moodCurve: (d, t) => 7 - (4 * d) / t,
    anxietyCurve: (d, t) => 3 + (4 * d) / t,
    assignedClinician: 1,
  },
  {
    email: 'demo.patient5@therapyjournal.local',
    password: 'DemoPatient5!',
    fullName: 'Sam Patel',
    archetype: 'stable_low_severity',
    description: 'Stable/low severity throughout',
    days: 10,
    moodCurve: () => 7.5,
    anxietyCurve: () => 2.5,
    assignedClinician: 0,
  },
]

// ── Helpers ──

function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function gaussianNoise(rng: () => number, std: number): number {
  const u1 = rng()
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2) * std
}

const THEMES_POOL = [
  'sleep', 'work_stress', 'social_connection', 'motivation', 'exercise',
  'family', 'appetite', 'rumination', 'self_care', 'irritability',
]

const EMOTIONS_POOL = [
  'anxious', 'calm', 'sad', 'hopeful', 'tired', 'frustrated',
  'grateful', 'overwhelmed', 'content', 'stressed',
]

const JOURNAL_TEMPLATES = [
  (mood: number) => mood >= 7
    ? "Today felt lighter. I managed to get through my tasks without feeling overwhelmed. Had a good conversation with a friend that reminded me I'm not alone in this."
    : mood >= 5
    ? "An okay day. Not great, not terrible. I went through the motions at work and tried to stay present. The evenings are still hard though."
    : "Rough day. Woke up feeling heavy and it didn't really lift. I tried to push through but ended up just wanting to withdraw from everything.",
  (mood: number) => mood >= 7
    ? "Went for a walk this morning and actually enjoyed it. The fresh air helped clear my head. Feeling more like myself lately."
    : mood >= 5
    ? "Mixed feelings today. Some moments were okay, others felt like wading through mud. I'm trying to notice the small wins."
    : "Couldn't sleep well last night and it set the tone for the whole day. Everything felt harder than it should. Just tired of feeling this way.",
  (mood: number) => mood >= 7
    ? "Had a really productive therapy session. We talked about some patterns I've been noticing and I feel like things are starting to click."
    : mood >= 5
    ? "Tried to practice some of the coping strategies we discussed. Some worked, some didn't. At least I'm trying."
    : "The anxiety was really bad today. Heart racing, couldn't focus. Took my medication and it helped a bit but I still felt on edge all day.",
]

// ── EWMA Helpers ──

const LN2 = Math.log(2)

interface EwmaStats {
  mean: number; std: number; count: number; lastUpdatedAt: string | null
}

function updateEwmaStats(current: EwmaStats, newValue: number, opts: { now: Date }): EwmaStats {
  const halfLifeMs = 45 * 24 * 60 * 60 * 1000
  const now = opts.now
  const prevMean = Number.isFinite(current.mean) ? current.mean : newValue
  const prevVar = current.std * current.std
  const prevUpdatedAt = current.lastUpdatedAt ? new Date(current.lastUpdatedAt) : null
  const dt = prevUpdatedAt ? Math.max(0, now.getTime() - prevUpdatedAt.getTime()) : 0
  const decay = prevUpdatedAt ? Math.exp((-LN2 * dt) / Math.max(1, halfLifeMs)) : 0
  const oneMinus = 1 - decay
  const mean = decay * prevMean + oneMinus * newValue
  const varNew = decay * prevVar + oneMinus * (newValue - prevMean) * (newValue - mean)
  const std = Math.sqrt(Math.max(0, varNew))
  return { mean, std, count: current.count + 1, lastUpdatedAt: now.toISOString() }
}

// ── Account Management ──

async function getOrCreateUser(spec: AccountSpec): Promise<string> {
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existing = existingUsers?.users?.find(u => u.email === spec.email)
  if (existing) {
    console.log(`  ✅ User exists: ${spec.email}`)
    return existing.id
  }

  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
    user_metadata: { full_name: spec.fullName, role: spec.role },
  })
  if (error) { console.error(`  ❌ Failed: ${error.message}`); process.exit(1) }
  console.log(`  ✅ Created: ${spec.email}`)
  await new Promise(r => setTimeout(r, 500))
  return newUser.user.id
}

async function ensureProfile(userId: string, role: string, fullName: string) {
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).single()
  if (data) return
  await supabase.from('profiles').insert({ id: userId, role, full_name: fullName })
}

async function ensureLink(patientId: string, therapistId: string) {
  const { data } = await supabase.from('patient_therapist')
    .select('patient_id').eq('patient_id', patientId).eq('therapist_id', therapistId).maybeSingle()
  if (data) return
  await supabase.from('patient_therapist').insert({ patient_id: patientId, therapist_id: therapistId })
}

// ── Data Generation ──

async function seedPatientData(patientId: string, spec: PatientSpec) {
  // Clear existing data
  const { data: entries } = await supabase.from('journal_entries').select('id').eq('patient_id', patientId)
  if (entries && entries.length > 0) {
    const ids = entries.map(e => e.id)
    await supabase.from('crisis_alerts').delete().eq('patient_id', patientId)
    await supabase.from('entry_embeddings').delete().in('entry_id', ids)
    await supabase.from('ai_extractions').delete().in('entry_id', ids)
    await supabase.from('structured_logs').delete().in('entry_id', ids)
    await supabase.from('journal_entries').delete().eq('patient_id', patientId)
  }
  await supabase.from('patient_baselines').delete().eq('patient_id', patientId)

  const rng = seededRandom(spec.email.length * 1337)
  let moodBase: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
  let anxBase: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }

  for (let day = 0; day < spec.days; day++) {
    const entryDate = new Date()
    entryDate.setDate(entryDate.getDate() - (spec.days - 1 - day))
    entryDate.setHours(8 + Math.floor(rng() * 10), Math.floor(rng() * 60), 0, 0)

    const baseMood = spec.moodCurve(day, spec.days)
    const baseAnxiety = spec.anxietyCurve(day, spec.days)
    const mood = clamp(Math.round((baseMood + gaussianNoise(rng, 0.6)) * 10) / 10, 1, 10)
    const anxiety = clamp(Math.round((baseAnxiety + gaussianNoise(rng, 0.6)) * 10) / 10, 1, 10)

    const template = JOURNAL_TEMPLATES[day % JOURNAL_TEMPLATES.length]
    const content = template(mood)

    const numEmotions = 1 + Math.floor(rng() * 3)
    const emotions: string[] = []
    for (let i = 0; i < numEmotions; i++) {
      const e = EMOTIONS_POOL[Math.floor(rng() * EMOTIONS_POOL.length)]
      if (!emotions.includes(e)) emotions.push(e)
    }

    const numSymptoms = Math.floor(rng() * 3)
    const symptoms: string[] = []
    for (let i = 0; i < numSymptoms; i++) {
      const s = THEMES_POOL[Math.floor(rng() * THEMES_POOL.length)]
      if (!symptoms.includes(s)) symptoms.push(s)
    }

    const triggers = [THEMES_POOL[Math.floor(rng() * THEMES_POOL.length)]]

    // Insert journal entry
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        patient_id: patientId,
        content,
        is_draft: false,
        shared_with_therapist: true,
        created_at: entryDate.toISOString(),
        updated_at: entryDate.toISOString(),
      })
      .select('id')
      .single()

    if (entryError) { console.error(`  ❌ Entry error: ${entryError.message}`); continue }

    // Insert structured log
    const sleepHours = clamp(5 + rng() * 4 + (mood > 6 ? 1 : -0.5), 3, 10)
    await supabase.from('structured_logs').insert({
      entry_id: entry.id,
      sleep_hours: Math.round(sleepHours * 10) / 10,
      sleep_quality: clamp(Math.round(mood * 0.8 + rng() * 2), 1, 10),
      medication_taken: rng() > 0.15,
      energy_level: clamp(Math.round(mood * 0.7 + rng() * 3), 1, 10),
    })

    // Compute z-scores from baselines
    let mood_z: number | null = null
    let anx_z: number | null = null
    if (moodBase.count >= 5 && moodBase.std > 0) {
      mood_z = Math.round(((mood - moodBase.mean) / moodBase.std) * 100) / 100
    }
    if (anxBase.count >= 5 && anxBase.std > 0) {
      const calmness = 11 - anxiety
      anx_z = Math.round(((calmness - anxBase.mean) / anxBase.std) * 100) / 100
    }

    // Insert AI extraction (synthetic)
    const crisis_detected = mood <= 2.5 && anxiety >= 8
    await supabase.from('ai_extractions').insert({
      entry_id: entry.id,
      mood_score: mood,
      anxiety_score: anxiety,
      emotions,
      symptoms,
      triggers,
      confidence: 0.85,
      crisis_detected,
      summary: `Mood: ${mood}/10, Anxiety: ${anxiety}/10. ${emotions.join(', ')}.`,
      mood_z_score: mood_z,
      anxiety_z_score: anx_z,
    })

    if (crisis_detected) {
      await supabase.from('crisis_alerts').insert({
        patient_id: patientId,
        entry_id: entry.id,
        severity: 'medium',
        therapist_notified: false,
        resolved: false,
        created_at: entryDate.toISOString(),
      })
    }

    // Update baselines
    if (moodBase.count === 0) {
      moodBase = { mean: mood, std: 0, count: 1, lastUpdatedAt: entryDate.toISOString() }
    } else {
      moodBase = updateEwmaStats(moodBase, mood, { now: entryDate })
    }
    const calmness = 11 - anxiety
    if (anxBase.count === 0) {
      anxBase = { mean: calmness, std: 0, count: 1, lastUpdatedAt: entryDate.toISOString() }
    } else {
      anxBase = updateEwmaStats(anxBase, calmness, { now: entryDate })
    }

    process.stdout.write('.')
  }

  // Persist final baselines
  const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('patient_baselines').upsert([
    { patient_id: patientId, metric_name: 'mood', baseline_mean: moodBase.mean, baseline_std: moodBase.std, sample_count: moodBase.count, window_start: windowStart, last_updated: moodBase.lastUpdatedAt },
    { patient_id: patientId, metric_name: 'anxiety', baseline_mean: anxBase.mean, baseline_std: anxBase.std, sample_count: anxBase.count, window_start: windowStart, last_updated: anxBase.lastUpdatedAt },
  ], { onConflict: 'patient_id,metric_name' })

  console.log(` ${spec.days} entries`)
}

// ── Main ──

async function main() {
  console.log('🌱 Demo Cohort Seeder')
  console.log('=====================\n')

  // 1. Create clinicians
  console.log('👨‍⚕️ Creating clinician accounts...')
  const clinicianIds: string[] = []
  for (const c of CLINICIANS) {
    const id = await getOrCreateUser(c)
    await ensureProfile(id, 'therapist', c.fullName)
    clinicianIds.push(id)
  }

  // 2. Create admin
  console.log('\n🔐 Creating admin account...')
  const adminId = await getOrCreateUser(ADMIN)
  await ensureProfile(adminId, 'admin', ADMIN.fullName)

  // 3. Create patients and seed data
  console.log('\n👥 Creating patients and seeding data...')
  for (const p of PATIENTS) {
    console.log(`\n  📝 ${p.fullName} (${p.archetype})`)
    const patientId = await getOrCreateUser({ email: p.email, password: p.password, fullName: p.fullName, role: 'patient' })
    await ensureProfile(patientId, 'patient', p.fullName)
    await ensureLink(patientId, clinicianIds[p.assignedClinician])
    process.stdout.write('  Generating entries: ')
    await seedPatientData(patientId, p)
  }

  // 4. Summary
  console.log('\n\n=====================')
  console.log('✅ Demo cohort seeded!')
  console.log(`  👨‍⚕️ ${CLINICIANS.length} clinicians`)
  console.log(`  🔐 1 admin`)
  console.log(`  👥 ${PATIENTS.length} patients`)
  console.log(`  📝 ${PATIENTS.reduce((s, p) => s + p.days, 0)} total journal entries`)

  console.log('\n🔑 Credentials:')
  for (const c of CLINICIANS) console.log(`  Clinician: ${c.email} / ${c.password}`)
  console.log(`  Admin:     ${ADMIN.email} / ${ADMIN.password}`)
  for (const p of PATIENTS) console.log(`  Patient:   ${p.email} / ${p.password} (${p.archetype})`)
  console.log('')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
