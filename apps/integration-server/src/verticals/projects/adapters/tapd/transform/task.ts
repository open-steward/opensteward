import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw TAPD Story (user story / requirement).
 *
 * Stories are the primary work item in TAPD and map cleanly to the
 * canonical Task.  Status values: planning, in_progress, developing,
 * audited, for_test, testing, resolved, rejected.
 *
 * Priority labels (priority_label): High, Middle, Low, Nice To Have.
 *
 * Ref: https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/story/
 */
export interface RawTapdStory {
  id: string
  name?: string
  description?: string
  workspace_id?: string
  creator?: string
  created?: string
  modified?: string
  status?: string
  owner?: string
  begin?: string
  due?: string
  completed?: string
  priority_label?: string
  priority?: string
  iteration_id?: string
  parent_id?: string
  children_id?: string
  label?: string
  is_archived?: string
  [key: string]: unknown
}

function mapStatus(raw: RawTapdStory): TaskStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'resolved' || s === 'done') return 'closed'
  if (s === 'rejected') return 'closed'
  if (s === 'in_progress' || s === 'developing' || s === 'for_test' || s === 'testing') return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawTapdStory): TaskPriority | undefined {
  const pl = (raw.priority_label ?? raw.priority ?? '').toLowerCase()
  if (pl === 'high') return 'high'
  if (pl === 'middle' || pl === 'medium' || pl === 'normal') return 'medium'
  if (pl === 'low') return 'low'
  if (pl === 'nice to have') return 'low'
  return undefined
}

/**
 * Extract comma- or pipe-separated label names into a stable list of
 * pseudo-IDs we can use as tag references.  TAPD does not have separate
 * tag objects on stories — labels are embedded as a string.
 */
function extractTagIds(raw: RawTapdStory): string[] {
  const label = raw.label ?? ''
  if (!label) return []
  return label
    .split(/[,|]/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `${raw.workspace_id ?? ''}:label:${l}`)
}

export function transformTask(raw: RawTapdStory, projectId?: string): Task {
  const pid = projectId ?? raw.workspace_id ?? ''
  const ownerIds = (raw.owner ?? '').split(';').map((o) => o.trim()).filter(Boolean)
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: pickStr(raw.parent_id !== '0' ? raw.parent_id : undefined),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due),
    assigneeIds: ownerIds,
    tagIds: extractTagIds(raw),
    subtaskCount: undefined,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.modified),
    platform: 'tapd',
    metadata: strMap({
      iterationId: raw.iteration_id,
      completedAt: toIso(raw.completed),
      isArchived: raw.is_archived,
    }),
    raw,
  }
}
