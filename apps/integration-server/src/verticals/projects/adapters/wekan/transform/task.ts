/**
 * Wekan card → canonical Task.
 *
 * Card fields (from GET /api/boards/:boardId/lists/:listId/cards/:cardId):
 *   _id, title, description, archived, archivedAt, listId, boardId, swimlaneId,
 *   parentId (for linked cards), members[], assignees[], labelIds[],
 *   dueAt, startAt, endAt, createdAt, modifiedAt, dateLastActivity,
 *   customFields[]{_id,value}, color, type, sort
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawWekanCard {
  _id: string
  title?: string
  description?: string
  archived?: boolean
  archivedAt?: string
  listId?: string
  boardId?: string
  swimlaneId?: string
  parentId?: string | null
  members?: string[]
  assignees?: string[]
  labelIds?: string[]
  dueAt?: string | null
  startAt?: string | null
  endAt?: string | null
  createdAt?: string
  modifiedAt?: string
  dateLastActivity?: string
  customFields?: Array<{ _id: string; value?: unknown }>
  color?: string
  type?: string
  sort?: number
  [key: string]: unknown
}

function mapStatus(raw: RawWekanCard): TaskStatus {
  if (raw.archived) return 'closed'
  return 'open'
}

export function transformCard(raw: RawWekanCard, boardId?: string): Task {
  const effectiveBoardId = boardId ?? raw.boardId ?? ''
  // Deduplicate assignee ids from both members and assignees arrays
  const assigneeIds = [
    ...(raw.members ?? []),
    ...(raw.assignees ?? []),
  ].filter((id, i, arr) => arr.indexOf(id) === i)

  return {
    id: raw._id,
    externalId: raw._id,
    projectId: effectiveBoardId,
    parentId: pickStr(raw.parentId ?? undefined),
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.dueAt ?? raw.endAt),
    assigneeIds,
    tagIds: raw.labelIds ?? [],
    subtaskCount: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.modifiedAt ?? raw.dateLastActivity),
    platform: 'wekan',
    metadata: strMap({
      listId: raw.listId,
      swimlaneId: raw.swimlaneId,
      color: raw.color,
      type: raw.type,
    }),
    raw,
  }
}
