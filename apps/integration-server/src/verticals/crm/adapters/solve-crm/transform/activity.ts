import type { Activity } from '../../../schema/activity'

export interface RawSolveActivity {
  id?: string | number
  type?: string
  subject?: string
  details?: string | null
  dueDate?: string | null
  completed?: boolean | null
  contactId?: string | null
  organisationId?: string | null
  projectId?: string | null
  assignee?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawSolveActivity): Activity {
  return {
    id: String(raw.id ?? ''),
    type: raw.type,
    subject: raw.subject,
    note: raw.details ?? undefined,
    due_date: raw.dueDate ?? undefined,
    done: raw.completed ?? undefined,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.organisationId != null ? String(raw.organisationId) : undefined,
    deal_id: raw.projectId != null ? String(raw.projectId) : undefined,
    owner_id: raw.assignee != null ? String(raw.assignee) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.details = data.note
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.organisationId = data.company_id
  if (data.deal_id !== undefined) out.projectId = data.deal_id
  if (data.owner_id !== undefined) out.assignee = data.owner_id
  return out
}
