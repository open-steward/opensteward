import type { Activity } from '../../../schema/activity'

export interface RawDeskeraActivity {
  id: string | number
  type?: string
  subject?: string
  note?: string
  contactId?: string | number
  companyId?: string | number
  dealId?: string | number
  ownerId?: string | number
  dueDate?: string
  done?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawDeskeraActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    note: raw.note,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    due_date: raw.dueDate,
    done: raw.done,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.done = data.done
  return out
}
