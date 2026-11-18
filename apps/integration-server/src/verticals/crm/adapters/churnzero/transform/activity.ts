/**
 * ChurnZero Task ↔ canonical Activity transform.
 *
 * ChurnZero Task fields from the REST API (OData v4):
 *   Id, AccountId, ContactId, Subject, Notes, DueDate, CompletedDate,
 *   TaskTypeId, IsComplete, AssignedUserId, ObjectCreatedDate, ObjectLastModifiedDate
 *
 * ChurnZero Tasks map cleanly to canonical Activities.
 */
import type { Activity } from '../../../schema/activity'

export interface RawChurnZeroTask {
  Id?: string | number
  AccountId?: string | number
  ContactId?: string | number
  Subject?: string
  Notes?: string
  DueDate?: string
  CompletedDate?: string
  TaskTypeId?: string | number
  IsComplete?: boolean
  AssignedUserId?: string | number
  ObjectCreatedDate?: string
  ObjectLastModifiedDate?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawChurnZeroTask): Activity {
  return {
    id: raw.Id != null ? String(raw.Id) : '',
    type: 'task',
    subject: raw.Subject ?? undefined,
    note: raw.Notes ?? undefined,
    contact_id: raw.ContactId != null ? String(raw.ContactId) : undefined,
    company_id: raw.AccountId != null ? String(raw.AccountId) : undefined,
    owner_id: raw.AssignedUserId != null ? String(raw.AssignedUserId) : undefined,
    due_date: raw.DueDate ?? undefined,
    done: raw.IsComplete === true,
    created_at: raw.ObjectCreatedDate ?? undefined,
    updated_at: raw.ObjectLastModifiedDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out['Subject'] = data.subject
  if (data.note !== undefined) out['Notes'] = data.note
  if (data.due_date !== undefined) out['DueDate'] = data.due_date
  if (data.owner_id !== undefined) out['AssignedUserId'] = data.owner_id
  if (data.done !== undefined) out['IsComplete'] = data.done
  return out
}
