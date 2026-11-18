import type { Activity } from '../../../schema/activity'

export interface RawZohoTask {
  id: string
  Subject?: string
  Description?: string
  Due_Date?: string
  Status?: string
  Owner?: { id: string; name?: string } | null
  Who_Id?: { id: string; name?: string } | null
  What_Id?: { id: string; name?: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawZohoTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.Subject ?? undefined,
    note: raw.Description ?? undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    due_date: raw.Due_Date ?? undefined,
    done: raw.Status === 'Completed',
    contact_id: raw.Who_Id?.id != null ? String(raw.Who_Id.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  if (data.subject !== undefined) record.Subject = data.subject
  if (data.note !== undefined) record.Description = data.note
  if (data.due_date !== undefined) record.Due_Date = data.due_date
  if (data.owner_id !== undefined) record.Owner = { id: data.owner_id }
  if (data.done !== undefined) record.Status = data.done ? 'Completed' : 'Not Started'
  return record
}
