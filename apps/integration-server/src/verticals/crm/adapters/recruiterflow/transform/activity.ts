import type { Activity } from '../../../schema/activity'

/**
 * Recruiterflow candidate activity object.
 *
 * Key fields (from /api/external/candidate/activity/list):
 *   id              – activity ID
 *   activity_type   – type/kind of activity
 *   subject         – short title
 *   note            – activity body / description
 *   candidate_id    – linked candidate ID
 *   client_id       – linked client ID
 *   created_at      – ISO-8601 creation timestamp
 *   updated_at      – ISO-8601 last-modified timestamp
 */
export interface RawRecruiterflowActivity {
  id: string | number
  activity_type?: string
  subject?: string
  note?: string
  candidate_id?: string | number
  client_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformActivity(raw: RawRecruiterflowActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.activity_type,
    subject: raw.subject,
    note: raw.note,
    contact_id: raw.candidate_id !== undefined ? String(raw.candidate_id) : undefined,
    company_id: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    created_at: toIso(raw.created_at),
    updated_at: toIso(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.type !== undefined) out.activity_type = data.type
  return out
}
