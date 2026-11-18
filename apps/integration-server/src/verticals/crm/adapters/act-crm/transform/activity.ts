import type { Activity } from '../../../schema/activity'

export interface RawActActivity {
  id?: string
  activityId?: string
  type?: string
  activityType?: string
  subject?: string
  details?: string | null
  dueDate?: string | null
  completedDate?: string | null
  isCompleted?: boolean | null
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
  managerId?: string | null
  created?: string | null
  edited?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawActActivity): Activity {
  const id = raw.id ?? raw.activityId ?? ''
  return {
    id: String(id),
    type: raw.activityType ?? raw.type,
    subject: raw.subject,
    note: raw.details ?? undefined,
    due_date: raw.dueDate ?? undefined,
    done: raw.isCompleted ?? (raw.completedDate != null ? true : undefined) ?? undefined,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.managerId != null ? String(raw.managerId) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.edited ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.activityType = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.details = data.note
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.isCompleted = data.done
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.owner_id !== undefined) out.managerId = data.owner_id
  return out
}
