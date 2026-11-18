import type { Activity } from '../../../schema/activity'

export interface RawSaleSmanagoTask {
  id?: string
  type?: string
  subject?: string
  note?: string
  contactId?: string
  ownerId?: string
  date?: number  // epoch ms
  done?: boolean
  createdOn?: number
  modifiedOn?: number
  [key: string]: unknown
}

export function transformActivity(raw: RawSaleSmanagoTask): Activity {
  return {
    id: String(raw.id ?? ''),
    type: raw.type as string | undefined,
    subject: raw.subject as string | undefined,
    note: raw.note as string | undefined,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    owner_id: raw.ownerId as string | undefined,
    due_date: raw.date != null ? new Date(raw.date as number).toISOString() : undefined,
    done: raw.done as boolean | undefined,
    created_at: raw.createdOn != null ? new Date(raw.createdOn as number).toISOString() : undefined,
    updated_at: raw.modifiedOn != null ? new Date(raw.modifiedOn as number).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.due_date !== undefined) out.date = new Date(data.due_date).getTime()
  if (data.done !== undefined) out.done = data.done
  return out
}
