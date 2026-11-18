import type { Activity } from '../../../schema/activity'

export interface RawSalesloftActivity {
  id: number
  subject?: string
  description?: string
  due_date?: string
  person_id?: number | null
  owner_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawSalesloftActivity): Activity {
  return {
    id: String(raw.id),
    subject: raw.subject,
    note: raw.description,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: raw.due_date,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out['subject'] = data.subject
  if (data.note !== undefined) out['description'] = data.note
  if (data.due_date !== undefined) out['due_date'] = data.due_date
  if (data.contact_id !== undefined) out['person_id'] = Number(data.contact_id)
  if (data.owner_id !== undefined) out['owner_id'] = Number(data.owner_id)
  return out
}
