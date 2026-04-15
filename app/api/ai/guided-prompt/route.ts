import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createChatCompletion, TEMPERATURE, MAX_TOKENS } from '@/lib/openai'
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import {
  retrieveRichUserContext,
  type RichUserContext,
  type RecentEntryContext,
  type FeatureFrequency,
  type MoodDataPoint,
  type UserFeatureAssociation,
} from '@/lib/graph/neo4jRetrieve'

interface ConversationMessage {
  role: 'ai' | 'user'
  content: string
}

// ─── Supabase fallback: fetch recent entries + AI extractions ───

interface SupabaseRecentEntry {
  id: string
  content: string
  created_at: string
  ai_extraction?: {
    mood_score: number | null
    emotions: string[]
    triggers: string[]
    symptoms: string[]
    summary: string | null
  } | null
}

async function fetchRecentEntriesFromSupabase(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  limit: number = 7
): Promise<SupabaseRecentEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(`
      id,
      content,
      created_at,
      ai_extractions (
        mood_score,
        emotions,
        triggers,
        symptoms,
        summary
      )
    `)
    .eq('patient_id', userId)
    .eq('is_draft', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    content: row.content as string,
    created_at: row.created_at as string,
    ai_extraction: Array.isArray(row.ai_extractions)
      ? (row.ai_extractions[0] as SupabaseRecentEntry['ai_extraction'] ?? null)
      : (row.ai_extractions as SupabaseRecentEntry['ai_extraction'] ?? null),
  }))
}

// ─── Build rich personalization context ───

function buildPersonalizationContext(
  neo4jContext: RichUserContext | null,
  supabaseEntries: SupabaseRecentEntry[],
  currentMood: number | null
): string {
  const sections: string[] = []

  // ── Section 1: Recent journal summaries (what the user actually wrote about) ──
  const recentSummaries = buildRecentSummaries(neo4jContext, supabaseEntries)
  if (recentSummaries) sections.push(recentSummaries)

  // ── Section 2: Recurring themes & patterns ──
  const patterns = buildPatternsSummary(neo4jContext, supabaseEntries)
  if (patterns) sections.push(patterns)

  // ── Section 3: Mood trajectory ──
  const moodTrend = buildMoodTrajectory(neo4jContext, supabaseEntries, currentMood)
  if (moodTrend) sections.push(moodTrend)

  // ── Section 4: Known mood associations (from calibration model) ──
  const associations = buildAssociationsSummary(neo4jContext?.featureAssociations ?? [])
  if (associations) sections.push(associations)

  if (sections.length === 0) return ''

  return `\n\nTHINGS YOU KNOW ABOUT THIS PERSON:\n${sections.join('\n\n')}

Use this context to SHAPE your question — but DON'T reference it directly.
- DON'T say "last time you wrote about..." or "you mentioned..." — that's robotic
- DO let your knowledge show implicitly: ask about things in a way that only works if you already know their life
- Example: if they've been stressed about work, don't say "you've been stressed about work." Just ask "work still being a lot?"
- Your awareness informs WHAT you ask, not HOW you frame it
- One casual thought. Under 40 words. Sound like a person, not a recap.
`
}

function buildRecentSummaries(
  neo4j: RichUserContext | null,
  supabaseEntries: SupabaseRecentEntry[]
): string | null {
  const entries: string[] = []

  // Prefer Neo4j entries (have richer graph context)
  if (neo4j?.recentEntries && neo4j.recentEntries.length > 0) {
    for (const e of neo4j.recentEntries.slice(0, 5)) {
      const date = new Date(e.timestamp).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      })
      const moodStr = e.mood ? ` (mood: ${e.mood}/10)` : ''
      const emotionStr = e.emotions.length > 0 ? ` | emotions: ${e.emotions.join(', ')}` : ''
      const triggerStr = e.triggers.length > 0 ? ` | stressors: ${e.triggers.join(', ')}` : ''
      const excerpt = e.textExcerpt
        ? `\n    "${e.textExcerpt.replace(/\n/g, ' ').trim()}${e.textExcerpt.length >= 295 ? '...' : ''}"`
        : ''
      entries.push(`  • ${date}${moodStr}${emotionStr}${triggerStr}${excerpt}`)
    }
  }

  // Fallback/supplement with Supabase entries
  if (entries.length < 3 && supabaseEntries.length > 0) {
    const used = new Set(neo4j?.recentEntries?.map(e => e.entryId) ?? [])
    for (const e of supabaseEntries) {
      if (used.has(e.id)) continue
      if (entries.length >= 5) break

      const date = new Date(e.created_at).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      })
      const ai = e.ai_extraction
      const moodStr = ai?.mood_score ? ` (mood: ${ai.mood_score}/10)` : ''
      const emotionStr = ai?.emotions?.length ? ` | emotions: ${ai.emotions.join(', ')}` : ''
      const triggerStr = ai?.triggers?.length ? ` | stressors: ${ai.triggers.join(', ')}` : ''
      const summary = ai?.summary ? `\n    "${ai.summary}"` : ''
      const excerpt = !summary && e.content
        ? `\n    "${e.content.slice(0, 300).replace(/\n/g, ' ').trim()}${e.content.length > 300 ? '...' : ''}"`
        : summary

      entries.push(`  • ${date}${moodStr}${emotionStr}${triggerStr}${excerpt}`)
    }
  }

  if (entries.length === 0) return null
  return `RECENT JOURNAL ENTRIES:\n${entries.join('\n')}`
}

function buildPatternsSummary(
  neo4j: RichUserContext | null,
  supabaseEntries: SupabaseRecentEntry[]
): string | null {
  // Use Neo4j top features if available
  if (neo4j?.topFeatures && neo4j.topFeatures.length > 0) {
    const grouped: Record<string, FeatureFrequency[]> = {}
    for (const f of neo4j.topFeatures) {
      const key = f.type === 'Theme' ? 'Recurring emotions' :
                  f.type === 'Stressor' ? 'Recurring stressors' :
                  f.type === 'Symptom' ? 'Recurring symptoms' : 'Other patterns'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(f)
    }

    const lines: string[] = []
    for (const [label, features] of Object.entries(grouped)) {
      const items = features.slice(0, 5).map(f =>
        `${f.name} (mentioned ${f.count}x)`
      ).join(', ')
      lines.push(`  ${label}: ${items}`)
    }

    if (lines.length > 0) return `RECURRING THEMES & PATTERNS:\n${lines.join('\n')}`
  }

  // Fallback: aggregate from Supabase AI extractions
  const emotionCounts: Record<string, number> = {}
  const triggerCounts: Record<string, number> = {}
  for (const e of supabaseEntries) {
    for (const em of e.ai_extraction?.emotions ?? []) {
      emotionCounts[em] = (emotionCounts[em] || 0) + 1
    }
    for (const tr of e.ai_extraction?.triggers ?? []) {
      triggerCounts[tr] = (triggerCounts[tr] || 0) + 1
    }
  }

  const lines: string[] = []
  const topEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topTriggers = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  if (topEmotions.length > 0) {
    lines.push(`  Recurring emotions: ${topEmotions.map(([n, c]) => `${n} (${c}x)`).join(', ')}`)
  }
  if (topTriggers.length > 0) {
    lines.push(`  Recurring stressors: ${topTriggers.map(([n, c]) => `${n} (${c}x)`).join(', ')}`)
  }

  if (lines.length === 0) return null
  return `RECURRING THEMES & PATTERNS:\n${lines.join('\n')}`
}

function buildMoodTrajectory(
  neo4j: RichUserContext | null,
  supabaseEntries: SupabaseRecentEntry[],
  currentMood: number | null
): string | null {
  let points: { date: string; mood: number }[] = []

  if (neo4j?.moodTrajectory && neo4j.moodTrajectory.length > 0) {
    points = neo4j.moodTrajectory.map(p => ({
      date: new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      mood: typeof p.mood === 'object' ? (p.mood as { low: number }).low ?? 0 : p.mood,
    }))
  } else {
    // Fallback from Supabase
    for (const e of [...supabaseEntries].reverse()) {
      const m = e.ai_extraction?.mood_score
      if (m) {
        points.push({
          date: new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          mood: m,
        })
      }
    }
  }

  if (points.length < 2) return null

  const recent = points.slice(-7)
  const avg = recent.reduce((s, p) => s + p.mood, 0) / recent.length
  const trend = recent.length >= 3
    ? recent[recent.length - 1].mood - recent[0].mood
    : 0

  let trendDesc = 'stable'
  if (trend > 1.5) trendDesc = 'improving'
  else if (trend > 0.5) trendDesc = 'slightly improving'
  else if (trend < -1.5) trendDesc = 'declining'
  else if (trend < -0.5) trendDesc = 'slightly declining'

  const moodLine = recent.map(p => `${p.date}: ${p.mood}/10`).join(' → ')
  const currentStr = currentMood ? `\n  Current mood today: ${currentMood}/10` : ''
  const comparison = currentMood && points.length > 0
    ? currentMood > avg + 1
      ? ` (higher than their recent average of ${avg.toFixed(1)})`
      : currentMood < avg - 1
        ? ` (lower than their recent average of ${avg.toFixed(1)})`
        : ` (similar to their recent average of ${avg.toFixed(1)})`
    : ''

  return `MOOD TRAJECTORY (trend: ${trendDesc}):\n  ${moodLine}${currentStr}${comparison}`
}

function buildAssociationsSummary(associations: UserFeatureAssociation[]): string | null {
  if (associations.length === 0) return null

  // Lower threshold to include more relevant associations
  const positive = associations.filter(f => f.effectMean > 0.2)
  const negative = associations.filter(f => f.effectMean < -0.2)

  const lines: string[] = []
  if (positive.length > 0) {
    lines.push(`  Things that tend to improve their mood: ${positive.slice(0, 5).map(f => f.name).join(', ')}`)
  }
  if (negative.length > 0) {
    lines.push(`  Things associated with lower mood: ${negative.slice(0, 5).map(f => f.name).join(', ')}`)
  }

  if (lines.length === 0) return null
  return `KNOWN MOOD FACTORS:\n${lines.join('\n')}`
}

// ─── Main route ───

// POST /api/ai/guided-prompt - Get a guided journaling prompt or follow-up
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mood_hint, conversation_history, is_followup, is_initial } = body as {
      mood_hint?: number
      conversation_history?: ConversationMessage[]
      is_followup?: boolean
      is_initial?: boolean
    }

    // Load the prompt template
    const promptPath = path.join(process.cwd(), 'prompts', 'guided_journal.txt')
    const promptTemplate = await fs.readFile(promptPath, 'utf-8')

    // ── Gather rich personal context from Neo4j + Supabase ──
    let neo4jContext: RichUserContext | null = null
    let supabaseEntries: SupabaseRecentEntry[] = []

    // Fetch both in parallel
    const [neo4jResult, supabaseResult] = await Promise.allSettled([
      retrieveRichUserContext(user.id, {
        recentEntryCount: 7,
        featureLimit: 15,
        moodDays: 30,
      }),
      fetchRecentEntriesFromSupabase(supabase, user.id, 7),
    ])

    if (neo4jResult.status === 'fulfilled') {
      neo4jContext = neo4jResult.value
    } else {
      console.log('Neo4j context unavailable:', neo4jResult.reason)
    }

    if (supabaseResult.status === 'fulfilled') {
      supabaseEntries = supabaseResult.value
    } else {
      console.log('Supabase entries unavailable:', supabaseResult.reason)
    }

    // Build rich personalization context
    const personalizationContext = buildPersonalizationContext(
      neo4jContext,
      supabaseEntries,
      mood_hint ?? null
    )

    // Build system message — personalization is ALWAYS included
    let systemMessage = promptTemplate + personalizationContext

    if (is_followup && conversation_history && conversation_history.length > 0) {
      // Follow-up questions: KEEP the personalization + add follow-up instructions
      systemMessage = `${promptTemplate}${personalizationContext}

YOU'RE MID-CONVERSATION. They just told you something. Respond like a friend:
- Don't parrot back what they said. They know what they said.
- Pick up on ONE thing — a detail, a feeling, a contradiction — and pull on that thread
- DON'T explicitly reference past entries or what they "wrote before." If something connects to their history, just ask about the THING itself, not the fact that they mentioned it.
- Sometimes just an observation is enough: "huh... that's not what I expected you to say"
- Mix it up: sometimes a question, sometimes finishing their thought, sometimes a gentle push-back

WAYS TO GO DEEPER (vary these):
- "...and how does that actually make you feel? not how you think you should feel"
- "Okay but what's underneath that?"
- "Do you actually believe that or are you just saying it?"
- "...say more about that"
- "Is that new or has that been building for a while?"
- Ask about a related thing from their life WITHOUT naming how you know: "how's [person/situation] fitting into all this?"

After 3-4 back-and-forths, you can loosely connect some dots: "so it kinda sounds like [observation]... does that land?"

RULES: Just the response. Under 40 words. Sound like a real person. No therapy voice. Don't constantly bring up their past entries.`
    }

    // Build the conversation for OpenAI
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemMessage }
    ]

    if (is_followup && conversation_history && conversation_history.length > 0) {
      // Add conversation history for context
      for (const msg of conversation_history) {
        messages.push({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content
        })
      }
      // Ask for follow-up — keep it casual
      messages.push({
        role: 'user',
        content: 'Now say something back. Like a friend would. Pick up on what I said — don\'t just ask another therapy question.'
      })
    } else {
      // Initial prompt
      let userMessage = ''
      if (mood_hint) {
        userMessage += `They rated their mood: ${mood_hint}/10\n`
      }

      if (personalizationContext) {
        userMessage += '\nYou know this person. Let that show naturally — ask about something going on in their life without spelling out that you know about it. Under 40 words, casual.'
      } else {
        userMessage += '\nYou don\'t know this person yet. Ask them something real and simple to get them writing. Not a therapy question — a friend question.'
      }

      messages.push({ role: 'user', content: userMessage })
    }

    // Call OpenAI
    const response = await createChatCompletion(
      messages,
      {
        temperature: is_followup ? 0.8 : TEMPERATURE.guided_prompt,
        maxTokens: MAX_TOKENS.guided_prompt,
      }
    )

    return NextResponse.json({ prompt: response.trim() })
  } catch (error) {
    console.error('Guided prompt error:', error)
    
    // Fallback prompts — casual, human
    const fallbackPrompts = [
      "So... what's actually on your mind right now?",
      "Okay, real talk — how are you doing today?",
      "What's one thing from today that keeps coming back to you?",
      "Forget the big stuff for a sec. How are you right now?",
      "If you could just get one thing off your chest... what would it be?",
    ]
    
    const randomPrompt = fallbackPrompts[Math.floor(Math.random() * fallbackPrompts.length)]
    
    return NextResponse.json({ prompt: randomPrompt })
  }
}
