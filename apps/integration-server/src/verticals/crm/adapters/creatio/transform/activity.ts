import type { Activity } from '../../../schema/activity'

export interface RawCreatioActivity {
  Id: string
  Title?: string
  Notes?: string
  DueDate?: string
  OwnerId?: string | null
  ContactId?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawCreatioActivity): Activity {
  return {
    id: String(raw.Id),
    subject: raw.Title,
    note: raw.Notes,
    due_date: raw.DueDate,
    owner_id: raw.OwnerId ?? undefined,
    contact_id: raw.ContactId ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Title = data.subject
  if (data.note !== undefined) out.Notes = data.note
  if (data.due_date !== undefined) out.DueDate = data.due_date
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  if (data.contact_id !== undefined) out.ContactId = data.contact_id
  return out
}
