import type { Activity } from '../../../schema/activity'
import type { NetHuntField, NetHuntRecord } from '../types'

/**
 * Field ids of the Tasks folder's role-bound fields, read from
 * GET /api/v2/folders/{folderId} (`fields[].role`). The documented roles:
 * "In the Tasks folder (folder `role: "task"`) the values are: `name`,
 * `description`, `completed`, `dueDate`, `allDay`, `priority`, `assignee`,
 * `creator`, `recordLink`."
 */
export interface TaskFieldIds {
  description?: string
  completed?: string
  dueDate?: string
  assignee?: string
}

export function taskFieldIds(fields: readonly NetHuntField[] | undefined): TaskFieldIds {
  const ids: TaskFieldIds = {}
  for (const f of fields ?? []) {
    if (f.role === 'description') ids.description = f.id
    else if (f.role === 'completed') ids.completed = f.id
    else if (f.role === 'dueDate') ids.dueDate = f.id
    else if (f.role === 'assignee') ids.assignee = f.id
  }
  return ids
}

function epochMsToIso(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : undefined
}

/**
 * A record of the folder whose `role` is `task` → canonical Activity.
 *
 * Value shapes, verbatim from components.schemas.Record `fields`:
 *   "**checkbox** → boolean"
 *   "**dateTime**, and time-valued statistics (`valueType: "TIME"`) → number — epoch milliseconds, any time of day"
 *   "**user** — single: string (email); multi: string[] (emails)"
 *   "**text / email / website / phoneNumber / address / single-line / multi-line** → string"
 * and `name` is "the record display name". A multi-user assignee is left in metadata: the
 * canonical `owner_id` holds one user.
 */
export function transformActivity(raw: NetHuntRecord, ids: TaskFieldIds = {}): Activity {
  const f = raw.fields
  const name = f['name']
  const description = ids.description !== undefined ? f[ids.description] : undefined
  const completed = ids.completed !== undefined ? f[ids.completed] : undefined
  const assignee = ids.assignee !== undefined ? f[ids.assignee] : undefined
  return {
    id: raw.id,
    type: 'task',
    subject: typeof name === 'string' && name !== '' ? name : undefined,
    note: typeof description === 'string' && description !== '' ? description : undefined,
    owner_id: typeof assignee === 'string' && assignee !== '' ? assignee : undefined,
    due_date: ids.dueDate !== undefined ? epochMsToIso(f[ids.dueDate]) : undefined,
    done: typeof completed === 'boolean' ? completed : undefined,
    created_at: raw.createdISO,
    updated_at: raw.updatedISO,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out['type'] = data.type
  if (data.subject !== undefined) out['subject'] = data.subject
  if (data.note !== undefined) out['description'] = data.note
  if (data.contact_id !== undefined) out['contact_id'] = data.contact_id
  if (data.deal_id !== undefined) out['deal_id'] = data.deal_id
  if (data.due_date !== undefined) out['due_date'] = data.due_date
  if (data.done !== undefined) out['completed'] = data.done
  return out
}
