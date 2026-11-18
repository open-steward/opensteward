import type { Activity } from '../../../schema/activity'

/**
 * `Task` in the Keap REST v2 OpenAPI spec
 * (https://crm.infusionsoft.com/app/v3/api-docs/V2): `id`, `title`,
 * `description`, `completed`, `due_time`, `assigned_to_user_id`,
 * `contact_id`, `opportunity_id`, `create_time`, `modification_time`.
 */
export interface RawKeapTask {
  id: string
  title?: string
  description?: string
  type?: string
  completed?: boolean
  due_time?: string
  assigned_to_user_id?: string | null
  contact_id?: string | null
  opportunity_id?: string | null
  create_time?: string
  modification_time?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawKeapTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.title,
    note: raw.description,
    due_date: raw.due_time,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    deal_id: raw.opportunity_id != null ? String(raw.opportunity_id) : undefined,
    owner_id: raw.assigned_to_user_id != null ? String(raw.assigned_to_user_id) : undefined,
    done: typeof raw.completed === 'boolean' ? raw.completed : undefined,
    created_at: raw.create_time,
    updated_at: raw.modification_time,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.contact_id !== undefined) out.contact = { id: Number(data.contact_id) }
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.done !== undefined) out.completed = data.done
  return out
}
