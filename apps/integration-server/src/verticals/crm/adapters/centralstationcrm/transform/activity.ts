/**
 * Transform CentralStationCRM "task" objects to/from canonical Activity.
 *
 * Wire shape (GET /people/{id}/tasks.json or /companies/{id}/tasks.json):
 * {
 *   task: {
 *     id, name, badge, user_id, created_by_user_id,
 *     attachable_id, attachable_type,
 *     precise_time, done_at, created_at, updated_at
 *   }
 * }
 *
 * badge values reflect task type: "call", "email", "meeting", "task", etc.
 * attachable_type: "Person" | "Company" | "Deal" | "Project"
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawCentralStationTask {
  id: number | string
  name?: string
  badge?: string
  user_id?: number | string
  created_by_user_id?: number | string
  attachable_id?: number | string
  attachable_type?: string
  precise_time?: string
  done_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawCentralStationTaskWrapper {
  task: RawCentralStationTask
  [key: string]: unknown
}

export function transformActivity(raw: RawCentralStationTask): Activity {
  const attachableType = raw.attachable_type?.toLowerCase()
  const attachableId = raw.attachable_id != null ? String(raw.attachable_id) : undefined

  return {
    id: String(raw.id),
    type: raw.badge ?? undefined,
    subject: raw.name ?? undefined,
    contact_id: attachableType === 'person' ? attachableId : undefined,
    company_id: attachableType === 'company' ? attachableId : undefined,
    deal_id: (attachableType === 'deal' || attachableType === 'project') ? attachableId : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    due_date: toIsoDatetime(raw.precise_time),
    done: raw.done_at != null,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const task: Record<string, unknown> = {}
  if (data.subject !== undefined) task.name = data.subject
  if (data.type !== undefined) task.badge = data.type
  if (data.owner_id !== undefined) task.user_id = data.owner_id
  if (data.due_date !== undefined) task.precise_time = data.due_date

  if (data.contact_id !== undefined) {
    task.attachable_id = data.contact_id
    task.attachable_type = 'Person'
  } else if (data.company_id !== undefined) {
    task.attachable_id = data.company_id
    task.attachable_type = 'Company'
  } else if (data.deal_id !== undefined) {
    task.attachable_id = data.deal_id
    task.attachable_type = 'Deal'
  }

  return { task }
}
