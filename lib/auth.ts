import { createServerSupabaseClient } from './supabase-server'
import { redirect } from 'next/navigation'
import type { Profile, UserRole } from '@/types'

export async function getSession() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}

export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  return session
}

export async function requireRole(role: UserRole) {
  const profile = await getProfile()
  if (!profile) {
    redirect('/login')
  }
  if (profile.role !== role) {
    // Redirect to appropriate dashboard based on actual role
    redirect(profile.role === 'patient' ? '/dashboard' : '/therapist/dashboard')
  }
  return profile
}

export async function requirePatient() {
  return requireRole('patient')
}

export async function requireTherapist() {
  return requireRole('therapist')
}

// Sign out helper
export async function signOut() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}

