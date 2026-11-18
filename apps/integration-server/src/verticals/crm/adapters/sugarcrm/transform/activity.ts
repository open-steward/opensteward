import type { Activity } from '../../../schema/activity'

export interface RawSugarTask {
  id: string
  name?: string
  description?: string
  date_due?: string
  status?: string
  assigned_user_id?: string
  contact_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value
  return `${value}Z`
}

export function transformActivity(raw: RawSugarTask): Activity {
  return {
    id: raw.id,
    type: 'task',
    subject: raw.name || undefined,
    note: raw.description || undefined,
    due_date: toIso(raw.date_due),
    done: raw.status === 'Completed',
    contact_id: raw.contact_id || undefined,
    owner_id: raw.assigned_user_id || undefined,
    created_at: toIso(raw.date_entered),
    updated_at: toIso(raw.date_modified),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.date_due = data.due_date
  if (data.done !== undefined) out.status = data.done ? 'Completed' : 'Not Started'
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  return out
}
