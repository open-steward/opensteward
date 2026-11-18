/**
 * Transform 1CRM Task records to/from the canonical Activity schema.
 *
 * 1CRM module: Task
 * Key API fields: id, name, status, priority, date_due, contact_id,
 *   parent_id, parent_type, assigned_user_id, description,
 *   date_entered, date_modified
 *
 * status values: Not Started, In Progress, Completed, Pending Input, Deferred
 */

import type { Activity } from '../../../schema/activity'
import { toIsoDatetime } from '@opensteward/shared'

export interface Raw1CrmTask {
  id: string
  name?: string
  status?: string
  priority?: string
  date_due?: string
  contact_id?: string
  parent_id?: string
  parent_type?: string
  assigned_user_id?: string
  description?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformActivity(raw: Raw1CrmTask): Activity {
  const status = raw.status ?? ''
  const done = status === 'Completed'

  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.name ?? undefined,
    note: raw.description ?? undefined,
    contact_id: raw.contact_id ?? undefined,
    owner_id: raw.assigned_user_id ?? undefined,
    due_date: toIsoDatetime(raw.date_due),
    done,
    created_at: toIsoDatetime(raw.date_entered),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  if (data.due_date !== undefined) out.date_due = data.due_date
  if (data.done !== undefined) {
    out.status = data.done ? 'Completed' : 'Not Started'
  }
  return out
}
