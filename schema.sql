-- AI Therapy Journal Platform - Database Schema
-- Run this in your Supabase SQL editor

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ============================================
-- CORE TABLES
-- ============================================

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text check (role in ('patient', 'therapist')) not null,
  full_name text,
  created_at timestamptz default now() not null
);

-- Patient-Therapist relationship
create table public.patient_therapist (
  patient_id uuid references public.profiles(id) on delete cascade,
  therapist_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (patient_id, therapist_id)
);

-- ============================================
-- JOURNAL TABLES
-- ============================================

-- Journal entries
create table public.journal_entries (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  is_draft boolean default false not null,
  shared_with_therapist boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Structured fields per entry
create table public.structured_logs (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid references public.journal_entries(id) on delete cascade unique not null,
  sleep_hours numeric,
  sleep_quality integer check (sleep_quality is null or (sleep_quality between 1 and 10)),
  medication_taken boolean,
  medication_notes text,
  energy_level integer check (energy_level is null or (energy_level between 1 and 10)),
  created_at timestamptz default now() not null
);

-- ============================================
-- AI PROCESSING TABLES
-- ============================================

-- AI extractions from journal entries
create table public.ai_extractions (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid references public.journal_entries(id) on delete cascade unique not null,
  mood_score integer check (mood_score is null or (mood_score between 1 and 10)),
  anxiety_score integer check (anxiety_score is null or (anxiety_score between 1 and 10)),
  -- Clinical-instrument-calibrated indicator checklists (AI-derived; not formal administration)
  phq9_indicators jsonb,
  gad7_indicators jsonb,
  phq9_estimate integer check (phq9_estimate is null or (phq9_estimate between 0 and 27)),
  gad7_estimate integer check (gad7_estimate is null or (gad7_estimate between 0 and 21)),
  -- Normalized scores (higher z = better; anxiety is reverse-coded internally to "calmness")
  mood_z_score numeric,
  anxiety_z_score numeric,
  mood_pop_z numeric,
  anxiety_pop_z numeric,
  emotions text[] default '{}',
  symptoms text[] default '{}',
  triggers text[] default '{}',
  confidence numeric check (confidence is null or (confidence between 0 and 1)),
  crisis_detected boolean default false not null,
  summary text,
  created_at timestamptz default now() not null
);

-- Per-patient running statistics for each metric (for normalization)
create table if not exists public.patient_baselines (
  patient_id uuid references public.profiles(id) on delete cascade not null,
  metric_name text not null, -- e.g. 'mood', 'anxiety'
  baseline_mean numeric not null default 0,
  baseline_std numeric not null default 0,
  sample_count integer not null default 0,
  window_start timestamptz, -- for rolling window calculations (approximation in app logic)
  last_updated timestamptz default now() not null,
  primary key (patient_id, metric_name)
);

-- Global population statistics across all patients
create table if not exists public.population_stats (
  metric_name text primary key, -- e.g. 'mood', 'anxiety'
  population_mean numeric not null default 0,
  population_std numeric not null default 0,
  sample_count integer not null default 0,
  last_updated timestamptz default now() not null
);

-- Entry embeddings for semantic search (RAG)
create table public.entry_embeddings (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid references public.journal_entries(id) on delete cascade not null,
  embedding vector(1536),
  chunk_text text not null,
  created_at timestamptz default now() not null
);

-- ============================================
-- CHAT TABLES
-- ============================================

-- Chat messages between patient and AI
create table public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references public.profiles(id) on delete cascade not null,
  role text check (role in ('user', 'assistant')) not null,
  content text not null,
  created_at timestamptz default now() not null
);

-- ============================================
-- SAFETY & COMPLIANCE TABLES
-- ============================================

-- Crisis alerts
create table public.crisis_alerts (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references public.profiles(id) on delete cascade not null,
  entry_id uuid references public.journal_entries(id) on delete cascade,
  severity text check (severity in ('low', 'medium', 'high')) not null,
  therapist_notified boolean default false not null,
  resolved boolean default false not null,
  created_at timestamptz default now() not null
);

-- Access logs for HIPAA compliance
create table public.access_logs (
  id uuid primary key default uuid_generate_v4(),
  therapist_id uuid references public.profiles(id) on delete cascade not null,
  patient_id uuid references public.profiles(id) on delete cascade not null,
  action text not null,
  created_at timestamptz default now() not null
);

-- ============================================
-- INDEXES
-- ============================================

-- Index for vector similarity search
create index on public.entry_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Index for journal entries lookup
create index idx_journal_entries_patient on public.journal_entries(patient_id);
create index idx_journal_entries_created on public.journal_entries(created_at desc);
create index idx_journal_entries_shared on public.journal_entries(shared_with_therapist) where shared_with_therapist = true;

-- Index for AI extractions
create index idx_ai_extractions_entry on public.ai_extractions(entry_id);

-- Index for patient baselines
create index if not exists idx_patient_baselines_patient on public.patient_baselines(patient_id);

-- Index for chat messages
create index idx_chat_messages_patient on public.chat_messages(patient_id);
create index idx_chat_messages_created on public.chat_messages(created_at desc);

-- Index for crisis alerts
create index idx_crisis_alerts_patient on public.crisis_alerts(patient_id);
create index idx_crisis_alerts_unresolved on public.crisis_alerts(resolved) where resolved = false;

-- Index for access logs
create index idx_access_logs_therapist on public.access_logs(therapist_id);
create index idx_access_logs_patient on public.access_logs(patient_id);
create index idx_access_logs_created on public.access_logs(created_at desc);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.patient_therapist enable row level security;
alter table public.journal_entries enable row level security;
alter table public.structured_logs enable row level security;
alter table public.ai_extractions enable row level security;
alter table public.patient_baselines enable row level security;
alter table public.population_stats enable row level security;
alter table public.entry_embeddings enable row level security;
alter table public.chat_messages enable row level security;
alter table public.crisis_alerts enable row level security;
alter table public.access_logs enable row level security;

-- Profiles: Users can read their own profile, therapists can read patient profiles
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Patient-Therapist: Both parties can view their relationships
create policy "View own patient-therapist relationships" on public.patient_therapist
  for select using (
    auth.uid() = patient_id or auth.uid() = therapist_id
  );

-- Journal Entries: Patients see own, therapists see shared entries from their patients
create policy "Patients can manage own entries" on public.journal_entries
  for all using (auth.uid() = patient_id);

create policy "Therapists can view shared entries from their patients" on public.journal_entries
  for select using (
    shared_with_therapist = true and
    exists (
      select 1 from public.patient_therapist pt
      where pt.patient_id = journal_entries.patient_id
      and pt.therapist_id = auth.uid()
    )
  );

-- Structured Logs: Same as journal entries
create policy "Patients can manage own structured logs" on public.structured_logs
  for all using (
    exists (
      select 1 from public.journal_entries je
      where je.id = entry_id and je.patient_id = auth.uid()
    )
  );

create policy "Therapists can view structured logs for shared entries" on public.structured_logs
  for select using (
    exists (
      select 1 from public.journal_entries je
      join public.patient_therapist pt on pt.patient_id = je.patient_id
      where je.id = entry_id
      and je.shared_with_therapist = true
      and pt.therapist_id = auth.uid()
    )
  );

-- AI Extractions: Same pattern
create policy "Patients can view own AI extractions" on public.ai_extractions
  for select using (
    exists (
      select 1 from public.journal_entries je
      where je.id = entry_id and je.patient_id = auth.uid()
    )
  );

create policy "System can insert AI extractions" on public.ai_extractions
  for insert with check (true);

create policy "Therapists can view AI extractions for shared entries" on public.ai_extractions
  for select using (
    exists (
      select 1 from public.journal_entries je
      join public.patient_therapist pt on pt.patient_id = je.patient_id
      where je.id = entry_id
      and je.shared_with_therapist = true
      and pt.therapist_id = auth.uid()
    )
  );

-- Entry Embeddings: Only accessible by the patient
create policy "Patients can manage own embeddings" on public.entry_embeddings
  for all using (
    exists (
      select 1 from public.journal_entries je
      where je.id = entry_id and je.patient_id = auth.uid()
    )
  );

-- Chat Messages: Patients see their own messages
create policy "Patients can manage own chat messages" on public.chat_messages
  for all using (auth.uid() = patient_id);

-- Crisis Alerts: Patients see own, their therapist sees alerts too
create policy "Patients can view own crisis alerts" on public.crisis_alerts
  for select using (auth.uid() = patient_id);

create policy "System can insert crisis alerts" on public.crisis_alerts
  for insert with check (true);

create policy "Therapists can view and update patient crisis alerts" on public.crisis_alerts
  for all using (
    exists (
      select 1 from public.patient_therapist pt
      where pt.patient_id = crisis_alerts.patient_id
      and pt.therapist_id = auth.uid()
    )
  );

-- Access Logs: Therapists can insert their own logs
create policy "Therapists can insert access logs" on public.access_logs
  for insert with check (auth.uid() = therapist_id);

create policy "Users can view access logs about them" on public.access_logs
  for select using (auth.uid() = patient_id or auth.uid() = therapist_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to match entry embeddings for semantic search
create or replace function match_entry_embeddings(
  query_embedding text,
  match_patient_id uuid,
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  entry_id uuid,
  chunk_text text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ee.entry_id,
    ee.chunk_text,
    1 - (ee.embedding <=> query_embedding::vector) as similarity
  from public.entry_embeddings ee
  join public.journal_entries je on je.id = ee.entry_id
  where je.patient_id = match_patient_id
  and 1 - (ee.embedding <=> query_embedding::vector) > match_threshold
  order by ee.embedding <=> query_embedding::vector
  limit match_count;
end;
$$;

-- Function to auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'patient'),
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;

-- Trigger to create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger for journal entries updated_at
create trigger on_journal_entry_updated
  before update on public.journal_entries
  for each row execute procedure public.handle_updated_at();

-- ============================================
-- SAMPLE DATA (for testing - remove in production)
-- ============================================

-- To use this schema:
-- 1. Create a new Supabase project
-- 2. Go to SQL Editor
-- 3. Paste this entire file and run
-- 4. Set up authentication in Supabase Auth dashboard

