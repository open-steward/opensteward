import type { Activity } from '../../../schema/activity'

// TODO: verify field names against Cobra CRM API docs (German/Dutch language)
export interface RawCobraCrmActivity {
  id: string | number
  type?: string
  subject?: string
  dueDate?: string | null
  completed?: boolean
  contactId?: string | number | null
  companyId?: string | number | null
  dealId?: string | number | null
  ownerId?: string | number | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawCobraCrmActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type ?? undefined,
    subject: raw.subject ?? undefined,
    due_date: raw.dueDate ?? undefined,
    done: raw.completed ?? undefined,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: raw.createdAt ?? undefined,
    updated_at: raw.updatedAt ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
