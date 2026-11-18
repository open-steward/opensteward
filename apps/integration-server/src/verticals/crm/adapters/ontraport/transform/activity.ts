import type { Activity } from '../../../schema/activity'

// Ontraport uses "Tasks" for activity-like records
export interface RawOntraportTask {
  id: string
  message?: string
  due_date?: string | null
  status?: string | null
  contact_id?: string | null
  owner?: string | null
  date?: string | null
  dlm?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawOntraportTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.message,
    due_date: raw.due_date ?? undefined,
    done: raw.status === '1',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: raw.date ?? undefined,
    updated_at: raw.dlm ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.message = data.subject
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.status = data.done ? '1' : '0'
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
