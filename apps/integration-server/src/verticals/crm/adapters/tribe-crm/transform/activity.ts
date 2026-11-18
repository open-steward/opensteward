/**
 * Transform between Tribe CRM Activity_Task records and the canonical
 * CRM Activity schema.
 *
 * Tribe CRM wire fields (PascalCase):
 *   Id              — unique identifier
 *   Subject         — task title / subject
 *   Description     — body / agenda notes
 *   ActivityType    — activity kind (call, meeting, task, email, …)
 *   RelationId      — linked relation (contact) identifier
 *   OrganisationId  — linked organisation (company) identifier
 *   ActivityId      — linked opportunity (deal) identifier
 *   OwnerId         — CRM user who owns this activity
 *   DueDate         — scheduled/due date (ISO-8601)
 *   IsCompleted     — boolean, whether the activity is done
 *   Duration        — duration in minutes
 *   CreatedOn       — ISO-8601 creation timestamp
 *   ModifiedOn      — ISO-8601 last-modified timestamp
 */
import type { Activity } from '../../../schema/activity'

export interface RawTribeCrmTask {
  Id: string | number
  Subject?: string
  Description?: string
  ActivityType?: string
  RelationId?: string | number | null
  OrganisationId?: string | number | null
  ActivityId?: string | number | null
  OwnerId?: string | number | null
  DueDate?: string
  IsCompleted?: boolean
  Duration?: number | null
  CreatedOn?: string
  ModifiedOn?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawTribeCrmTask): Activity {
  return {
    id: String(raw.Id),
    type: raw.ActivityType ?? undefined,
    subject: raw.Subject ?? undefined,
    note: raw.Description ?? undefined,
    contact_id: raw.RelationId != null ? String(raw.RelationId) : undefined,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    deal_id: raw.ActivityId != null ? String(raw.ActivityId) : undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    due_date: raw.DueDate ?? undefined,
    done: raw.IsCompleted ?? undefined,
    duration_minutes: raw.Duration ?? undefined,
    created_at: raw.CreatedOn ?? undefined,
    updated_at: raw.ModifiedOn ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Subject = data.subject
  if (data.note !== undefined) out.Description = data.note
  if (data.type !== undefined) out.ActivityType = data.type
  if (data.contact_id !== undefined) out.RelationId = data.contact_id
  if (data.deal_id !== undefined) out.ActivityId = data.deal_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  if (data.due_date !== undefined) out.DueDate = data.due_date
  if (data.done !== undefined) out.IsCompleted = data.done
  if (data.duration_minutes !== undefined) out.Duration = data.duration_minutes
  return out
}
