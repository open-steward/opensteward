import type { Activity } from '../../../schema/activity'

export interface RawWebcrmActivity {
  ActivityId?: number
  ActivityType?: string
  ActivitySubject?: string
  ActivityNote?: string
  PersonId?: number
  OrganisationId?: number
  OpportunityId?: number
  OwnedBy?: number
  ActivityDate?: string
  ActivityCompleted?: boolean
  ActivityCreatedAt?: string
  ActivityUpdatedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawWebcrmActivity): Activity {
  return {
    id: String(raw.ActivityId ?? ''),
    type: raw.ActivityType,
    subject: raw.ActivitySubject,
    note: raw.ActivityNote,
    contact_id: raw.PersonId != null ? String(raw.PersonId) : undefined,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    deal_id: raw.OpportunityId != null ? String(raw.OpportunityId) : undefined,
    owner_id: raw.OwnedBy != null ? String(raw.OwnedBy) : undefined,
    due_date: raw.ActivityDate,
    done: raw.ActivityCompleted,
    created_at: raw.ActivityCreatedAt,
    updated_at: raw.ActivityUpdatedAt,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.ActivityType = data.type
  if (data.subject !== undefined) out.ActivitySubject = data.subject
  if (data.note !== undefined) out.ActivityNote = data.note
  if (data.contact_id !== undefined) out.PersonId = Number(data.contact_id)
  if (data.company_id !== undefined) out.OrganisationId = Number(data.company_id)
  if (data.deal_id !== undefined) out.OpportunityId = Number(data.deal_id)
  if (data.due_date !== undefined) out.ActivityDate = data.due_date
  if (data.done !== undefined) out.ActivityCompleted = data.done
  return out
}
