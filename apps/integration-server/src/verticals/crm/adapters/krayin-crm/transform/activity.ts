import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'
import { optionalId, optionalString, requireId } from '../fields'

/**
 * GET /api/v1/activities and /api/v1/activities/{id}.
 * Fields from krayin/rest-api src/Http/Resources/V1/Activity/ActivityResource.php:
 * id, parent_id, title, type, comment, additional, schedule_from, schedule_to,
 * is_done, user (UserResource), files, participants, location, created_at,
 * updated_at. The documented `Activity` schema gives is_done "Status of the
 * task", example "0", and type is one of `call`, `meeting`, `lunch`, `file`,
 * `note` (activityStore request body enum).
 */
export interface RawKrayinActivity {
  id?: number | string
  parent_id?: number | string | null
  title?: string | null
  type?: string | null
  comment?: string | null
  schedule_from?: string | null
  schedule_to?: string | null
  is_done?: number | boolean | string | null
  user?: { id?: number | string | null } | null
  location?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function isDone(v: RawKrayinActivity['is_done']): boolean | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'boolean') return v
  const n = Number(v)
  return n === 0 || n === 1 ? n === 1 : undefined
}

export function transformActivity(raw: RawKrayinActivity): Activity {
  return {
    id: requireId(raw.id, 'activity'),
    type: optionalString(raw.type),
    subject: optionalString(raw.title),
    note: optionalString(raw.comment),
    owner_id: optionalId(raw.user?.id),
    // schedule_from: "Start time of the task".
    due_date: toIsoDatetime(raw.schedule_from),
    done: isDone(raw.is_done),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out['type'] = data.type
  if (data.subject !== undefined) out['title'] = data.subject
  if (data.note !== undefined) out['comment'] = data.note
  if (data.deal_id !== undefined) out['lead_id'] = data.deal_id
  if (data.due_date !== undefined) out['schedule_from'] = data.due_date
  if (data.done !== undefined) out['is_done'] = data.done
  return out
}
