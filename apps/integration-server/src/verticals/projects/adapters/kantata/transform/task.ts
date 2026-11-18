import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Kantata OX Story (called a "task" in the UI). Maps to the canonical `Task`.
 *
 * Associations (`workspace_id`, `parent_id`, `assignee_ids`, `tag_ids`) are
 * only present when the request asks for them via the `include` parameter.
 */
export interface RawKantataStory {
  id: string
  title?: string
  description?: string
  /** `task`, `deliverable`, `milestone`, or `issue`. */
  story_type?: string
  /** Human-readable state, e.g. `not started`, `started`, `completed`. */
  state?: string
  /** The current task status label (custom status sets). */
  status?: string
  /** Integer priority: 0/1/2/3 → low/normal/high/critical (varies by account). */
  priority?: number
  percentage_complete?: number
  due_date?: string
  start_date?: string
  archived?: boolean
  parent_id?: string | null
  workspace_id?: string
  assignee_ids?: string[]
  tag_ids?: string[]
  sub_story_count?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawKantataStory): TaskStatus {
  if (raw.archived) return 'closed'
  const state = (raw.state ?? '').toLowerCase()
  if (state === 'completed' || state === 'fixed' || state === 'resolved') return 'closed'
  if (state === 'started' || state === 'in progress') return 'in_progress'
  if (state === 'blocked') return 'blocked'
  if (state === "won't fix" || state === 'duplicate' || state === "can't reproduce") return 'closed'
  if ((raw.percentage_complete ?? 0) >= 100) return 'closed'
  return 'open'
}

function mapPriority(raw: RawKantataStory): TaskPriority | undefined {
  if (typeof raw.priority !== 'number') return undefined
  // Kantata priority is an integer; higher means more urgent.
  if (raw.priority >= 3) return 'urgent'
  if (raw.priority === 2) return 'high'
  if (raw.priority === 1) return 'medium'
  if (raw.priority <= 0) return 'low'
  return undefined
}

export function transformTask(raw: RawKantataStory, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.workspace_id) ?? ''
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: pickStr(raw.parent_id ?? undefined),
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: raw.assignee_ids ?? [],
    tagIds: raw.tag_ids ?? [],
    subtaskCount: raw.sub_story_count,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'kantata',
    metadata: strMap({
      platformType: raw.parent_id ? 'substory' : raw.story_type,
      storyType: raw.story_type,
      state: raw.state,
      status: raw.status,
      startDate: raw.start_date,
      percentageComplete: raw.percentage_complete,
    }),
    raw,
  }
}
