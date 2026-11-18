import type { Task, TaskStatus } from '../../../schema'
import { requiredName, strMap, unambiguousIso } from './shared'

/**
 * A WorkBoard metric (key result), mapped to the canonical Task.
 *
 * Fields as documented for GET /wb/apis/metric and GET
 * /wb/apis/metric/{metric_id} (https://apidocs.myworkboard.com/openapi.json).
 * The metric documents no due date, no description and no tags (tags are a
 * separate GET /metric/{metric_id}/tags), so those canonical fields stay empty.
 */
export interface RawWorkboardMetric {
  metric_id?: string
  metric_goal_id?: string
  metric_owner?: string
  metric_name?: string
  metric_target?: string
  metric_progress?: string
  metric_achieve_target?: string
  /** "The GMT timestamp value for the created at time." */
  metric_create_at?: string
  metric_modified_at?: string
  /** "0" - Deleted, "1" - Active, "2" - Closed, "3" - Excluded from Calculation */
  metric_status?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TaskStatus {
  if (s === '1') return 'open'
  if (s === '2') return 'closed'
  return 'unknown'
}

/**
 * `goalId` is the goal the metric was listed under; a metric read by id
 * carries its goal in `metric_goal_id`.
 */
export function transformTask(raw: RawWorkboardMetric, goalId?: string): Task {
  if (raw.metric_id == null || raw.metric_id === '')
    throw new Error('WorkBoard metric has no metric_id')
  const id = String(raw.metric_id)
  const projectId = goalId ?? (raw.metric_goal_id ? String(raw.metric_goal_id) : undefined)
  if (!projectId) throw new Error(`WorkBoard metric ${id} has no metric_goal_id`)
  return {
    id,
    externalId: id,
    projectId,
    title: requiredName(raw.metric_name, 'metric', id),
    status: mapStatus(raw.metric_status != null ? String(raw.metric_status) : undefined),
    assigneeIds: raw.metric_owner ? [String(raw.metric_owner)] : [],
    tagIds: [],
    createdAt: unambiguousIso(raw.metric_create_at),
    updatedAt: unambiguousIso(raw.metric_modified_at),
    platform: 'workboard',
    metadata: strMap({
      metric_status: raw.metric_status,
      metric_target: raw.metric_target,
      metric_achieve_target: raw.metric_achieve_target,
      metric_progress: raw.metric_progress,
    }),
    raw,
  }
}
