import type { Activity } from '../../../schema/activity'

// Rex CRM uses "appointments" for activity records
export interface RawRexAppointment {
  id?: number
  subject?: string
  description?: string
  appt_type?: string
  contact_id?: number | null
  listing_id?: number | null
  user_id?: number | null
  due_time?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawRexAppointment): Activity {
  return {
    id: String(raw.id ?? ''),
    type: raw.appt_type,
    subject: raw.subject,
    note: raw.description,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    deal_id: raw.listing_id != null ? String(raw.listing_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    due_date: raw.due_time,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.appt_type = data.type
  if (data.contact_id !== undefined) out.contact_id = Number(data.contact_id)
  if (data.deal_id !== undefined) out.listing_id = Number(data.deal_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.due_date !== undefined) out.due_time = data.due_date
  return out
}
