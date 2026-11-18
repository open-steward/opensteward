import type { Activity } from '../../../schema/activity'

// CorporateStack activity entity
// TODO: verify exact field names from API response
export interface RawCorporateStackActivity {
  id: string | number
  type?: string
  subject?: string
  note?: string
  contact_id?: string | number
  company_id?: string | number
  deal_id?: string | number
  owner_id?: string | number
  due_date?: string
  completed?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawCorporateStackActivity): Activity {
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
    created_at: raw.created_at,
    updated_at: raw.updated_at,
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
