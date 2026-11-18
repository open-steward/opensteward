/**
 * Businessmap card → canonical Task transform.
 *
 * API v2 GET /cards  →  { data: { data: [...], pagination: {...} } }
 * API v2 GET /cards/{cardId}  →  { data: { ... } }
 *
 * Priority encoding (integer):
 *   0 = none, 1 = low, 2 = average/medium, 3 = high, 4 = critical/urgent
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawBusinessmapCard {
  card_id?: number
  board_id?: number
  workflow_id?: number
  column_id?: number
  lane_id?: number
  title?: string
  description?: string
  priority?: number
  color?: string
  deadline?: string
  is_archived?: number
  is_discarded?: number
  is_blocked?: number
  owner_user_id?: number | null
  custom_id?: string
  size?: number
  position?: number
  section?: number
  type_id?: number
  created_at?: string
  last_modified?: string
  custom_fields?: Array<{ field_id: number; name?: string; value?: unknown; display_value?: unknown }>
  [key: string]: unknown
}

function mapStatus(raw: RawBusinessmapCard): TaskStatus {
  if (raw.is_discarded === 1) return 'closed'
  if (raw.is_archived === 1) return 'closed'
  return 'open'
}

function mapPriority(raw: RawBusinessmapCard): TaskPriority | undefined {
  // Businessmap priority: 0=none,1=low,2=average,3=high,4=critical
  switch (raw.priority) {
    case 4:
      return 'urgent'
    case 3:
      return 'high'
    case 2:
      return 'medium'
    case 1:
      return 'low'
    default:
      return undefined
  }
}

export function transformTask(raw: RawBusinessmapCard, boardId?: string): Task {
  const id = String(raw.card_id ?? '')
  const pid = boardId ?? String(raw.board_id ?? '')
  const ownerId = raw.owner_user_id != null ? String(raw.owner_user_id) : undefined
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: undefined, // child cards need a separate /cards/{id}/parents call
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.deadline),
    assigneeIds: ownerId ? [ownerId] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.last_modified),
    platform: 'businessmap',
    metadata: strMap({
      customId: raw.custom_id,
      columnId: pickNum(raw.column_id),
      laneId: pickNum(raw.lane_id),
      workflowId: pickNum(raw.workflow_id),
      color: raw.color,
      size: pickNum(raw.size),
    }),
    raw,
  }
}
