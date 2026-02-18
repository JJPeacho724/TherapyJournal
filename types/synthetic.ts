/**
 * Types for the synthetic demo system.
 * All data here is synthetic — no PHI, no real patient data.
 */

export type Archetype =
  | 'gradual_improver'
  | 'volatile_stabilizer'
  | 'hidden_deteriorator'
  | 'flat_non_responder'
  | 'early_dropout'
  | 'relapse_then_recover'

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  gradual_improver: 'Gradual Improver',
  volatile_stabilizer: 'Volatile Stabilizer',
  hidden_deteriorator: 'Hidden Deteriorator',
  flat_non_responder: 'Flat Non-Responder',
  early_dropout: 'Early Dropout',
  relapse_then_recover: 'Relapse then Recover',
}

export interface SyntheticPatient {
  id: string
  name: string
  archetype: Archetype
  start_date: string
  days_generated: number
  created_at: string
}

export interface SyntheticEvent {
  id: string
  entry_id: string
  day_index: number
  event_date: string
  mood_score: number
  anxiety_score: number
  journal_text: string
  themes: string[]
  evidence_snippets: EvidenceSnippetItem[]
  phq9_total: number | null
  gad7_total: number | null
  // Computed metrics (populated after generation)
  composite_score: number
  baseline_mean: number | null
  baseline_std: number | null
  z_score: number | null
  volatility_7d: number | null
  slope_7d: number | null
  slope_14d: number | null
}

export interface EvidenceSnippetItem {
  quote: string
  theme: string
}

export interface ClinicianFeedback {
  id: string
  clinician_user_id: string | null
  session_id: string | null
  patient_id: string
  event_date: string | null
  component: FeedbackComponent
  rating_useful: number | null
  rating_clear: number | null
  rating_risky: number | null
  notes: string | null
  created_at: string
}

export type FeedbackComponent =
  | 'baseline'
  | 'volatility'
  | 'slope'
  | 'weekly_summary'
  | 'evidence_snippets'

export const FEEDBACK_COMPONENTS: FeedbackComponent[] = [
  'baseline',
  'volatility',
  'slope',
  'weekly_summary',
  'evidence_snippets',
]

export const FEEDBACK_COMPONENT_LABELS: Record<FeedbackComponent, string> = {
  baseline: 'Baseline Normalization',
  volatility: 'Volatility Index',
  slope: 'Trend Slopes',
  weekly_summary: 'Weekly Summary',
  evidence_snippets: 'Evidence Snippets',
}

export interface WeeklySummary {
  weekNumber: number
  weekStart: string
  weekEnd: string
  overallTrend: string
  notableThemes: string[]
  evidenceSnippets: EvidenceSnippetItem[]
  volatilityNotes: string
  avgMood: number
  avgAnxiety: number
  avgComposite: number
  slope7d: number | null
}

export interface GenerateCohortRequest {
  patientsPerArchetype: number
  days: number
}

export interface GenerateCohortResponse {
  success: boolean
  patientsCreated: number
  entriesCreated: number
}

/** Metrics time-series point for charting */
export interface MetricsTimePoint {
  date: string
  dayIndex: number
  moodScore: number
  anxietyScore: number
  composite: number
  zScore: number | null
  volatility7d: number | null
  slope7d: number | null
  slope14d: number | null
}

/** Aggregated feedback stats for the admin dashboard */
export interface FeedbackAggregate {
  component: FeedbackComponent
  avgUseful: number | null
  avgClear: number | null
  avgRisky: number | null
  count: number
}

export interface FeedbackByArchetype {
  archetype: Archetype
  component: FeedbackComponent
  avgUseful: number | null
  avgClear: number | null
  avgRisky: number | null
  count: number
}
