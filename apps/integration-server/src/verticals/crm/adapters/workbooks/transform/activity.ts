import type { Activity } from '../../../schema/activity'

export interface RawWorkbooksTask {
  id: string | number
  name?: string
  description?: string
  activity_type?: string
  activity_status?: string
  assigned_to_id?: string | number
  due_date?: string
  start_date?: string
  duration?: number | string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawWorkbooksTask): Activity {
  const status = typeof raw.activity_status === 'string' ? raw.activity_status.toLowerCase() : undefined
  const done = status === 'complete' || status === 'completed'

  return {
    id: String(raw.id),
    type: typeof raw.activity_type === 'string' ? raw.activity_type.toLowerCase() : undefined,
    subject: raw.name,
    note: raw.description,
    owner_id: raw.assigned_to_id !== undefined ? String(raw.assigned_to_id) : undefined,
    due_date: raw.due_date,
    done,
    duration_minutes: raw.duration !== undefined ? Number(raw.duration) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out['name'] = data.subject
  if (data.note !== undefined) out['description'] = data.note
  if (data.due_date !== undefined) out['due_date'] = data.due_date
  if (data.done !== undefined) out['activity_status'] = data.done ? 'Complete' : 'Not Started'
  return out
}
