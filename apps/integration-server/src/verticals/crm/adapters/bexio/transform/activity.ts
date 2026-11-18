import type { Activity } from '../../../schema/activity'

// Bexio uses "tasks" for activities
export interface RawBexioTask {
  id?: number
  subject?: string
  description?: string
  todo_status_id?: number
  contact_id?: number
  user_id?: number
  deadline?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawBexioTask): Activity {
  return {
    id: String(raw.id ?? ''),
    subject: raw.subject,
    note: raw.description,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    due_date: raw.deadline,
    // todo_status_id: 1=open, 2=done
    done: raw.todo_status_id === 2,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.contact_id !== undefined) out.contact_id = Number(data.contact_id)
  if (data.due_date !== undefined) out.deadline = data.due_date
  if (data.done !== undefined) out.todo_status_id = data.done ? 2 : 1
  return out
}
