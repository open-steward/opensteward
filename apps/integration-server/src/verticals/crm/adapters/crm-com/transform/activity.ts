import type { Activity } from '../../../schema/activity'

// CRM.COM uses "interactions" for activities/events
export interface RawCrmComInteraction {
  id: string
  type?: string
  subject?: string
  note?: string
  contact_id?: string
  company_id?: string
  deal_id?: string
  owner_id?: string
  due_date?: string
  completed?: boolean
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawCrmComInteraction): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    note: raw.note,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: raw.due_date,
    done: raw.completed,
    created_at: raw.created_date,
    updated_at: raw.updated_date,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.completed = data.done
  return out
}
