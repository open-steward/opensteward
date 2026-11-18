import type { Activity } from '../../../schema/activity'

export interface RawBrevoActivity {
  id?: string
  // The task's type is an id (a taskType record), not a free-form string.
  taskTypeId?: string
  name?: string
  notes?: string
  // Links live at the top level as arrays — a task can be linked to more
  // than one record. Contacts are Brevo's numeric contact ids; companies and
  // deals are their own string ids.
  contactsIds?: number[]
  companiesIds?: string[]
  dealsIds?: string[]
  assignToId?: string
  date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawBrevoActivity): Activity {
  return {
    id: String(raw.id ?? ''),
    type: raw.taskTypeId,
    subject: raw.name,
    note: raw.notes,
    contact_id: raw.contactsIds?.[0] != null ? String(raw.contactsIds[0]) : undefined,
    company_id: raw.companiesIds?.[0],
    deal_id: raw.dealsIds?.[0],
    owner_id: raw.assignToId,
    due_date: raw.date,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.taskTypeId = data.type
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.notes = data.note
  if (data.contact_id !== undefined) out.contactsIds = [Number(data.contact_id)]
  if (data.company_id !== undefined) out.companiesIds = [data.company_id]
  if (data.deal_id !== undefined) out.dealsIds = [data.deal_id]
  if (data.owner_id !== undefined) out.assignToId = data.owner_id
  if (data.due_date !== undefined) out.date = data.due_date
  return out
}
