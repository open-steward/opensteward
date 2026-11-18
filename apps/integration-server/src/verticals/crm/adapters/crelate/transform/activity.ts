/**
 * Crelate task (PublicApiGetTaskResponse) → canonical Activity.
 *
 * Tasks are Crelate's activity-equivalent (calls, meetings, to-dos).
 * Key fields: id, body (subject/note), due_date, completed_on,
 *   duration_minutes, owners, parent_id (linked entity), created_on.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawCrelateTask {
  id: string
  /** Short subject / title for the task. */
  body?: string
  due_date?: string
  completed_on?: string
  /** Duration in minutes if tracked. */
  duration_minutes?: number
  /** ID of the parent entity (contact, company, or job). */
  parent_id?: string
  parent_name?: string
  owners?: Array<{ id?: string; name?: string; is_primary?: boolean }>
  created_by_id?: string
  created_on?: string
  modified_on?: string
  [key: string]: unknown
}

function pickOwnerId(raw: RawCrelateTask): string | undefined {
  const owners = raw.owners ?? []
  const primary = owners.find((o) => o.is_primary)
  return primary?.id ?? owners[0]?.id ?? raw.created_by_id
}

export function transformActivity(raw: RawCrelateTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.body ?? undefined,
    note: raw.body ?? undefined,
    owner_id: pickOwnerId(raw),
    due_date: toIsoDatetime(raw.due_date),
    done: raw.completed_on != null,
    duration_minutes:
      raw.duration_minutes != null && Number.isInteger(raw.duration_minutes)
        ? raw.duration_minutes
        : undefined,
    created_at: toIsoDatetime(raw.created_on),
    updated_at: toIsoDatetime(raw.modified_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.body = data.subject
  if (data.note !== undefined && data.subject === undefined) out.body = data.note
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.duration_minutes !== undefined) out.duration_minutes = data.duration_minutes
  return out
}
