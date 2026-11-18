import type { Activity } from '../../../schema/activity'

// Recruit CRM Activity entity
// Docs: https://docs.recruitcrm.io/
export interface RawRecruitCrmActivity {
  id?: string | number
  type?: string
  subject?: string
  description?: string
  due_date?: string
  is_completed?: boolean | number
  contact_id?: string | number
  company_id?: string | number
  deal_id?: string | number
  owner?: { id?: string | number } | string | number
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawRecruitCrmActivity): Activity {
  const ownerId = typeof raw.owner === 'object' && raw.owner !== null
    ? raw.owner.id
    : raw.owner
  return {
    id: String(raw.id ?? ''),
    type: raw.type,
    subject: raw.subject,
    note: raw.description,
    due_date: raw.due_date,
    done: raw.is_completed === true || raw.is_completed === 1,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: ownerId != null ? String(ownerId) : undefined,
    created_at: raw.created_on,
    updated_at: raw.updated_on,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.type = data.type
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.is_completed = data.done
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  return out
}
