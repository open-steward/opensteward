/**
 * Teamhood item → canonical Task.
 *
 * GET /api/v1/items → GetItemsResponse {items, nextPageUrl}
 * GET /api/v1/items/{itemId} → Entities.Item
 *
 * Entities.Item fields read here (OpenAPI "Teamhood API v1"): id, displayId,
 * workspaceId, boardId (nullable), rowId, title, statusId, ownerId,
 * assignedUserId, color, startDate, dueDate, completedOn, description,
 * completed, archived, modifiedDate, createdDate, milestone, isSuspended,
 * suspendReason, parentId, tags (string[]), url.
 *
 * Status: the item's own booleans. `completed` and `archived` close it; the
 * board column (`statusId`) is kept in metadata, since resolving it takes a
 * request per board. A suspended item has no canonical task status, so it
 * stays open with `isSuspended` in metadata.
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTeamhoodItem {
  id: string
  displayId?: string | null
  title?: string | null
  description?: string | null
  workspaceId?: string
  boardId?: string | null
  rowId?: string
  statusId?: string | null
  ownerId?: string | null
  assignedUserId?: string | null
  parentId?: string | null
  color?: number | null
  startDate?: string | null
  dueDate?: string | null
  completedOn?: string | null
  createdDate?: string
  modifiedDate?: string
  completed?: boolean
  archived?: boolean
  milestone?: boolean
  isSuspended?: boolean
  suspendReason?: string | null
  tags?: string[] | null
  url?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawTeamhoodItem): TaskStatus {
  if (raw.completed) return 'closed'
  if (raw.archived) return 'closed'
  return 'open'
}

/**
 * `boardId` is the board the item was listed under. Without it (a lookup by
 * id) the item's own documented `boardId` is used; an item with neither has
 * no project to belong to, and the transform refuses rather than invent one.
 */
export function transformTask(raw: RawTeamhoodItem, boardId?: string): Task {
  const projectId = boardId ?? pickStr(raw.boardId)
  if (!projectId) {
    throw new Error(`teamhood item ${raw.id} has no boardId, so it cannot be mapped to a project`)
  }
  const tagIds = (raw.tags ?? []).filter((t): t is string => typeof t === 'string' && t !== '')

  return {
    id: raw.id,
    externalId: raw.id,
    projectId,
    parentId: pickStr(raw.parentId),
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    dueDate: toIso(raw.dueDate),
    assigneeIds: raw.assignedUserId ? [raw.assignedUserId] : [],
    tagIds,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.modifiedDate),
    platform: 'teamhood',
    metadata: strMap({
      displayId: raw.displayId,
      workspaceId: raw.workspaceId,
      rowId: raw.rowId,
      statusId: raw.statusId,
      ownerId: raw.ownerId,
      milestone: raw.milestone,
      archived: raw.archived,
      isSuspended: raw.isSuspended,
      suspendReason: raw.suspendReason,
      color: raw.color,
      startDate: raw.startDate,
      completedOn: raw.completedOn,
      url: raw.url,
    }),
    raw,
  }
}
