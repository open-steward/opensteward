import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * Raw Manatal activity object.
 * Activities in Manatal are sub-resources attached to candidates, contacts, and jobs.
 * We inject the parent resource ID from the calling adapter method.
 */
export interface RawManatalActivity {
  id: number
  activity_type?: string
  description?: string
  created_by?: number | null
  scheduled_at?: string | null
  created_at?: string
  updated_at?: string
  // Injected by the adapter when fetching activities under a parent resource
  _candidate_id?: string
  _contact_id?: string
  _job_id?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawManatalActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.activity_type ?? undefined,
    subject: raw.activity_type ?? undefined,
    note: raw.description ?? undefined,
    contact_id: raw._candidate_id ?? raw._contact_id ?? undefined,
    deal_id: raw._job_id ?? undefined,
    owner_id: raw.created_by != null ? String(raw.created_by) : undefined,
    due_date: toIsoDatetime(raw.scheduled_at),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.activity_type = data.type
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.scheduled_at = data.due_date ?? null
  return out
}
