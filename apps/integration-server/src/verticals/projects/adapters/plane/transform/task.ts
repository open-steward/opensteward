import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Plane work item (issue).
 * Docs: https://developers.plane.so/api-reference/issue/list-issues
 *
 * `state` is a state UUID; its workflow `group` (backlog/unstarted/started/
 * completed/cancelled) determines the canonical status and is resolved by the
 * adapter from the project's states and passed in as `stateGroup`.
 * `assignees`/`labels` are UUID arrays. `parent` points to a parent work item.
 */
export interface RawPlaneIssue {
  id: string
  name?: string
  description_html?: string
  description_stripped?: string
  priority?: string
  state?: string | null
  assignees?: string[]
  labels?: string[]
  parent?: string | null
  project?: string
  workspace?: string
  sequence_id?: number
  sub_issues_count?: number
  start_date?: string | null
  target_date?: string | null
  completed_at?: string | null
  created_at?: string
  updated_at?: string
  created_by?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawPlaneIssue, stateGroup?: string): TaskStatus {
  switch (stateGroup) {
    case 'backlog':
    case 'unstarted':
      return 'open'
    case 'started':
      return 'in_progress'
    case 'completed':
      return 'closed'
    case 'cancelled':
      return 'cancelled'
    default:
      return raw.completed_at ? 'closed' : 'open'
  }
}

function mapPriority(raw: RawPlaneIssue): TaskPriority | undefined {
  switch ((raw.priority ?? '').toLowerCase()) {
    case 'urgent':
      return 'urgent'
    case 'high':
      return 'high'
    case 'medium':
      return 'medium'
    case 'low':
      return 'low'
    default:
      return undefined
  }
}

export function transformTask(
  raw: RawPlaneIssue,
  projectId?: string,
  stateGroup?: string,
): Task {
  const pid = projectId ?? pickStr(raw.project) ?? ''
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: pickStr(raw.parent),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description_stripped),
    status: mapStatus(raw, stateGroup),
    priority: mapPriority(raw),
    dueDate: toIso(raw.target_date),
    assigneeIds: raw.assignees ?? [],
    tagIds: raw.labels ?? [],
    subtaskCount: raw.sub_issues_count,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'plane',
    metadata: strMap({
      platformType: raw.parent ? 'subissue' : 'issue',
      sequenceId: raw.sequence_id,
      stateId: raw.state,
      stateGroup,
    }),
    raw,
  }
}
