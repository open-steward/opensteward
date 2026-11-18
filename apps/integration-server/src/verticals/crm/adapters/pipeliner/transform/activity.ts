import type { Activity } from '../../../schema/activity'

export interface RawPipelinerActivity {
  id: string
  subject?: string
  note?: string
  activity_date?: string | null
  contact_id?: string | null
  lead_oppty_id?: string | null
  owner_id?: string | null
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawPipelinerActivity): Activity {
  return {
    id: String(raw.id),
    subject: raw.subject,
    note: raw.note,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    deal_id: raw.lead_oppty_id != null ? String(raw.lead_oppty_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: raw.activity_date ?? undefined,
    created_at: raw.created,
    updated_at: raw.modified,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.due_date !== undefined) out.activity_date = data.due_date
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.deal_id !== undefined) out.lead_oppty_id = data.deal_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
