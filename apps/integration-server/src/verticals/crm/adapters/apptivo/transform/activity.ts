import type { Activity } from '../../../schema/activity'

export interface RawApptivoActivity {
  activityId?: string
  id?: string
  activityType?: string
  subject?: string
  description?: string | null
  dueDate?: string | null
  status?: string | null
  contactId?: string | null
  customerId?: string | null
  opportunityId?: string | null
  assigneeId?: string | null
  createdDate?: string | null
  modifiedDate?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawApptivoActivity): Activity {
  const id = raw.activityId ?? raw.id ?? ''
  return {
    id: String(id),
    type: raw.activityType,
    subject: raw.subject,
    note: raw.description ?? undefined,
    due_date: raw.dueDate ?? undefined,
    done: raw.status === 'completed' || raw.status === 'done',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.customerId != null ? String(raw.customerId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.assigneeId != null ? String(raw.assigneeId) : undefined,
    created_at: raw.createdDate ?? undefined,
    updated_at: raw.modifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.activityType = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.status = data.done ? 'completed' : 'open'
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.customerId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.owner_id !== undefined) out.assigneeId = data.owner_id
  return out
}
