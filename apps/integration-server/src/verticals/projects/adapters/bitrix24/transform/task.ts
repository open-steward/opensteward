import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawBitrix24Task {
  gid: string
  name?: string
  notes?: string
  completed?: boolean
  due_on?: string
  due_at?: string
  parent?: { gid: string } | null
  projects?: Array<{ gid: string }>
  assignee?: { gid: string } | null
  tags?: Array<{ gid: string }>
  num_subtasks?: number
  custom_fields?: Array<{ name: string; display_value?: string; enum_value?: { name: string } }>
  created_at?: string
  modified_at?: string
  resource_subtype?: string
  [key: string]: unknown
}

function mapStatus(raw: RawBitrix24Task): TaskStatus {
  if (raw.completed) return 'closed'
  return 'open'
}

function mapPriority(raw: RawBitrix24Task): TaskPriority | undefined {
  const field = raw.custom_fields?.find((f) => f.name?.toLowerCase() === 'priority')
  const v = (field?.enum_value?.name ?? field?.display_value ?? '').toLowerCase()
  if (v === 'urgent' || v === 'critical') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal') return 'medium'
  if (v === 'low') return 'low'
  return undefined
}

export function transformTask(raw: RawBitrix24Task, projectId?: string): Task {
  const pid = projectId ?? raw.projects?.[0]?.gid ?? ''
  return {
    id: raw.gid,
    externalId: raw.gid,
    projectId: pid,
    parentId: raw.parent?.gid,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.notes),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_at ?? raw.due_on),
    assigneeIds: raw.assignee ? [raw.assignee.gid] : [],
    tagIds: (raw.tags ?? []).map((t) => t.gid),
    subtaskCount: raw.num_subtasks,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.modified_at),
    platform: 'bitrix24',
    metadata: strMap({
      platformType: raw.parent ? 'subtask' : 'task',
      resourceSubtype: raw.resource_subtype,
    }),
    raw,
  }
}
