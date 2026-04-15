// User & Auth Types
export type UserRole = 'patient' | 'therapist'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  created_at: string
}

export interface PatientTherapist {
  patient_id: string
  therapist_id: string
  created_at: string
}

// Journal Types
export interface JournalEntry {
  id: string
  patient_id: string
  content: string
  is_draft: boolean
  shared_with_therapist: boolean
  created_at: string
  updated_at: string
  // Joined data
  structured_log?: StructuredLog
  ai_extraction?: AIExtraction
}

export interface StructuredLog {
  id: string
  entry_id: string
  sleep_hours: number | null
  sleep_quality: number | null // 1-10
  medication_taken: boolean | null
  medication_notes: string | null
  energy_level: number | null // 1-10
  created_at: string
}

// AI Types
export interface PHQ9Indicators {
  anhedonia: number
  depressed_mood: number
  sleep_issues: number
  fatigue: number
  appetite_changes: number
  worthlessness: number
  concentration: number
  psychomotor: number
  self_harm_thoughts: number
}

export interface GAD7Indicators {
  nervous: number
  uncontrollable_worry: number
  excessive_worry: number
  trouble_relaxing: number
  restless: number
  irritable: number
  afraid: number
}

export interface AIExtraction {
  id: string
  entry_id: string
  mood_score: number // 1-10
  anxiety_score: number // 1-10
  phq9_indicators: PHQ9Indicators | null
  gad7_indicators: GAD7Indicators | null
  mood_z_score: number | null
  anxiety_z_score: number | null
  mood_pop_z: number | null
  anxiety_pop_z: number | null
  phq9_estimate: number | null // 0-27
  gad7_estimate: number | null // 0-21
  emotions: string[]
  symptoms: string[]
  triggers: string[]
  confidence: number // 0-1
  crisis_detected: boolean
  summary: string
  created_at: string
}

export interface EntryEmbedding {
  id: string
  entry_id: string
  embedding: number[]
  chunk_text: string
  created_at: string
}

// Chat Types
export interface ChatMessage {
  id: string
  patient_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// Alert Types
export type CrisisSeverity = 'low' | 'medium' | 'high'

export interface CrisisAlert {
  id: string
  patient_id: string
  entry_id: string
  severity: CrisisSeverity
  therapist_notified: boolean
  resolved: boolean
  created_at: string
}

// Access Logging (HIPAA)
export interface AccessLog {
  id: string
  therapist_id: string
  patient_id: string
  action: string
  created_at: string
}

// API Request/Response Types
export interface CreateJournalRequest {
  content: string
  is_draft?: boolean
  shared_with_therapist?: boolean
  // User self-report (ground truth label for calibration; optional)
  self_report_mood?: number | null // 1-10
  structured_log?: Omit<StructuredLog, 'id' | 'entry_id' | 'created_at'>
}

export interface UpdateJournalRequest {
  content?: string
  is_draft?: boolean
  shared_with_therapist?: boolean
  structured_log?: Partial<Omit<StructuredLog, 'id' | 'entry_id' | 'created_at'>>
}

export interface AIExtractionRequest {
  entry_id: string
  content: string
}

export interface AIExtractionResponse {
  mood_score: number
  anxiety_score: number
  phq9_indicators: PHQ9Indicators
  gad7_indicators: GAD7Indicators
  emotions: string[]
  symptoms: string[]
  triggers: string[]
  confidence: number
  crisis_detected: boolean
  crisis_severity?: CrisisSeverity
  summary: string
}

export interface GuidedPromptRequest {
  previous_content?: string
  mood_hint?: number
}

export interface GuidedPromptResponse {
  prompt: string
}

export interface ChatRequest {
  message: string
  context_entry_ids?: string[]
}

export interface ChatResponse {
  response: string
  referenced_entries?: string[]
}

export interface EmbeddingSearchRequest {
  query: string
  limit?: number
}

export interface EmbeddingSearchResult {
  entry_id: string
  chunk_text: string
  similarity: number
}

// Dashboard Types
export interface MoodDataPoint {
  date: string
  mood: number
  anxiety: number
}

export interface SymptomFrequency {
  symptom: string
  count: number
}

export interface SleepMoodCorrelation {
  sleep_hours: number
  mood: number
}

export interface PatientOverview {
  id: string
  full_name: string
  last_entry_date: string | null
  average_mood: number | null
  has_crisis_flag: boolean
  entry_count: number
}

// Time-of-day mood tracking types
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export interface MoodByTimeOfDay {
  hour: number
  mood: number
  anxiety: number
  date: string
  timeOfDay: TimeOfDay
}

export interface TimeOfDayMoodSummary {
  timeOfDay: TimeOfDay
  label: string
  avgMood: number
  avgAnxiety: number
  entryCount: number
  hourRange: string
}

export interface HourlyMoodData {
  hour: number
  displayHour: string
  mood: number | null
  anxiety: number | null
  entryCount: number
}