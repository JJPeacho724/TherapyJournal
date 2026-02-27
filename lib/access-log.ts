/**
 * Structured access logging for HIPAA compliance.
 *
 * Logs who accessed what patient data and when to the access_logs table.
 * Best-effort — never fails the parent request.
 */

import { createServiceRoleClient } from '@/lib/supabase-server'

export type AccessAction =
  | 'viewed_journal_list'
  | 'viewed_journal_entry'
  | 'created_journal_entry'
  | 'updated_journal_entry'
  | 'deleted_journal_entry'
  | 'ran_ai_extraction'
  | 'viewed_patient_detail'
  | 'ran_guided_prompt'
  | 'searched_embeddings'
  | 'graph_retrieve'
  | 'graph_predict'
  | 'graph_train'

export async function logAccess(params: {
  userId: string
  patientId?: string
  action: AccessAction
  route: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const svc = await createServiceRoleClient()
    await svc.from('access_logs').insert({
      therapist_id: params.userId,
      patient_id: params.patientId ?? params.userId,
      action: params.action,
      metadata: params.metadata ?? null,
    })
  } catch (err) {
    console.error('[access-log] Failed to write access log:', err)
  }
}
