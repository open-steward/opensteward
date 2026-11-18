/**
 * Kaiten "card" → canonical Task.
 *
 * Card fields (from GET /cards or GET /cards/{id}):
 *   id, title, description (only with additional_card_fields=description),
 *   state (1=queued/open, 2=inProgress/open, 3=done/closed),
 *   board_id, column_id, lane_id,
 *   owner_id, members (array of member objects with id),
 *   tags (array of tag objects with id),
 *   due_date, planned_start, planned_end,
 *   parents_ids, children_ids, children_count, children_done,
 *   created, updated, completed_at
 *
 * Kaiten has no native priority enum; priority is tracked via custom
 * properties so we leave it undefined.
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKaitenCard {
  id: number
  title?: string
  description?: string | null
  /** 1=queued, 2=inProgress, 3=done */
  state?: number
  board_id?: number
  column_id?: number | null
  lane_id?: number | null
  owner_id?: number | null
  owner?: { id?: number } | null
  members?: Array<{ id?: number; [key: string]: unknown }>
  tags?: Array<{ id?: number; [key: string]: unknown }>
  due_date?: string | null
  planned_start?: string | null
  planned_end?: string | null
  parents_ids?: number[] | null
  children_ids?: number[] | null
  children_count?: number
  children_done?: number
  created?: string
  updated?: string
  completed_at?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawKaitenCard): TaskStatus {
  // state 3 = done
  if (raw.state === 3) return 'closed'
  return 'open'
}

export function transformTask(raw: RawKaitenCard, boardId?: string): Task {
  const id = String(raw.id)
  const pid = boardId ?? (raw.board_id != null ? String(raw.board_id) : '')

  // Collect assignee IDs: owner + members
  const assigneeIds: string[] = []
  if (raw.owner_id != null) assigneeIds.push(String(raw.owner_id))
  for (const m of raw.members ?? []) {
    if (m.id != null) {
      const mid = String(m.id)
      if (!assigneeIds.includes(mid)) assigneeIds.push(mid)
    }
  }

  const tagIds = (raw.tags ?? [])
    .filter((t) => t.id != null)
    .map((t) => String(t.id))

  const parentId =
    raw.parents_ids && raw.parents_ids.length > 0
      ? String(raw.parents_ids[0])
      : undefined

  const subtaskCount =
    typeof raw.children_count === 'number' ? raw.children_count : undefined

  return {
    id,
    externalId: id,
    projectId: pid,
    parentId,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description ?? undefined),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.due_date),
    assigneeIds,
    tagIds,
    subtaskCount,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'kaiten',
    metadata: strMap({
      state: raw.state,
      columnId: raw.column_id,
      laneId: raw.lane_id,
      boardId: raw.board_id,
    }),
    raw,
  }
}
