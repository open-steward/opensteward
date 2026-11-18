import type { Activity } from '../../../schema/activity'

// Kylas CRM activity entity (called "tasks" in API)
export interface RawKylasActivity {
  id: number
  taskType?: string
  title?: string
  description?: string
  contactId?: number
  companyId?: number
  dealId?: number
  ownedBy?: { id?: number }
  dueDate?: string
  completed?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawKylasActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.taskType,
    subject: raw.title,
    note: raw.description,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.ownedBy?.id != null ? String(raw.ownedBy.id) : undefined,
    due_date: raw.dueDate,
    done: raw.completed,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.taskType = data.type
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.contact_id !== undefined) out.contactId = Number(data.contact_id)
  if (data.company_id !== undefined) out.companyId = Number(data.company_id)
  if (data.deal_id !== undefined) out.dealId = Number(data.deal_id)
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  return out
}
