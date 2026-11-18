/**
 * Toggl Plan task transform.
 *
 * Tasks are the core scheduling object in Toggl Plan. They have a name,
 * date range (start_date / end_date), status, assigned workspace members,
 * and optional tag IDs.
 *
 * Docs: https://developers.plan.toggl.com/api-v5.html
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTogglPlanTask {
  id: number | string
  name?: string
  notes?: string
  /** YYYY-MM-DD */
  start_date?: string
  /** YYYY-MM-DD */
  end_date?: string
  start_time?: string
  end_time?: string
  /** "done" = closed; absent / other = open */
  status?: string
  /** Array of workspace-member IDs assigned to the task */
  workspace_members?: number[]
  /** Array of tag IDs */
  tag_ids?: number[]
  folder_id?: number | null
  color?: string
  color_id?: number
  estimated_hours?: string | number
  estimated_minutes?: number
  position?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawTogglPlanTask): TaskStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'done') return 'closed'
  return 'open'
}

export function transformTask(raw: RawTogglPlanTask, projectId?: string): Task {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    projectId: projectId ?? '',
    parentId: undefined,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.notes),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.end_date),
    assigneeIds: (raw.workspace_members ?? []).map(String),
    tagIds: (raw.tag_ids ?? []).map(String),
    subtaskCount: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'toggl-plan',
    metadata: strMap({
      startDate: raw.start_date,
      startTime: raw.start_time,
      endTime: raw.end_time,
      estimatedHours: raw.estimated_hours,
      estimatedMinutes: raw.estimated_minutes,
      color: raw.color,
      folderId: raw.folder_id,
    }),
    raw,
  }
}
