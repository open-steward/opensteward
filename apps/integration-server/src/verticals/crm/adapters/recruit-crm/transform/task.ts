import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * A Recruit CRM Task, as returned by GET /v1/tasks and GET /v1/tasks/{task}.
 * Fields from the Task model of the Recruit CRM API reference
 * (https://docs.recruitcrm.io/docs/rcrm-api-reference/56abb1012ba1e-task):
 * id "Task ID", title "Title of Task", description "Task Description",
 * start_date "Start Date and time of task", owner "Owner",
 * created_on "Created On", updated_on "Updated On".
 *
 * `related_to` is documented as the "Associated entity's slug", while this
 * adapter's contacts, companies and deals are keyed by their numeric `id`, so
 * it is not mapped to contact_id / company_id / deal_id (it stays in metadata).
 * `status` is documented only by the example "o", with no list of values, so
 * `done` is not derived from it.
 */
export interface RawRecruitCrmTask {
  id: number
  title?: string
  description?: string
  start_date?: string
  owner?: string
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

/** Tasks, meetings and call logs number their ids separately; the prefix keeps them apart. */
export const TASK_ID_PREFIX = 'task_'

export function transformTask(raw: RawRecruitCrmTask): Activity {
  if (raw.id == null) throw new Error('Recruit CRM task has no id')
  return {
    id: `${TASK_ID_PREFIX}${String(raw.id)}`,
    type: 'task',
    subject: raw.title,
    note: raw.description,
    due_date: toIsoDatetime(raw.start_date),
    owner_id: raw.owner != null && raw.owner !== '' ? String(raw.owner) : undefined,
    created_at: toIsoDatetime(raw.created_on),
    updated_at: toIsoDatetime(raw.updated_on),
    metadata: raw,
  }
}
