/**
 * Transform a Nextcloud Deck card into the canonical Task schema.
 *
 * Cards live inside stacks (columns) within a board. Each card has:
 *   - id, title, description, duedate (ISO-8601 string)
 *   - archived / done flags
 *   - assignedUsers: [{ id, participant: { uid, displayname } }]
 *   - labels: [{ id, title, color }]
 *   - createdAt / lastModified (Unix timestamps)
 *   - stackId, boardId (from the URL context / response)
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNextcloudDeckCard {
  id: number
  title?: string
  description?: string
  duedate?: string | null
  archived?: boolean
  done?: string | null
  stackId?: number
  boardId?: number
  order?: number
  type?: string
  lastModified?: number
  createdAt?: number
  deletedAt?: number
  assignedUsers?: Array<{
    id?: number
    participant?: { uid?: string; displayname?: string; type?: number }
  }>
  labels?: Array<{ id: number; title?: string; color?: string; boardId?: number }>
  attachmentCount?: number
  commentsUnread?: number
  [key: string]: unknown
}

function mapStatus(raw: RawNextcloudDeckCard): TaskStatus {
  if (raw.archived) return 'closed'
  if (raw.done) return 'closed'
  return 'open'
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return toIso(new Date(ts * 1000).toISOString())
}

export function transformCard(raw: RawNextcloudDeckCard, projectId?: string): Task {
  const boardId = raw.boardId != null ? String(raw.boardId) : (projectId ?? '')
  const pid = projectId ?? boardId
  const stackId = raw.stackId != null ? String(raw.stackId) : ''
  const cardId = String(raw.id)
  // Compound id: "<boardId>/<stackId>/<cardId>" — matches getTask() parsing logic
  const compoundId = `${boardId}/${stackId}/${cardId}`

  // Assignee ids use compound "<boardId>/<uid>" to match getUser() and transformUser()
  const assigneeIds = (raw.assignedUsers ?? [])
    .map((u) => u.participant?.uid)
    .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
    .map((uid) => `${boardId}/${uid}`)

  // Tag ids use compound "<boardId>/<labelId>" to match getTag() and transformLabel()
  const tagIds = (raw.labels ?? []).map((l) => `${boardId}/${String(l.id)}`)

  return {
    id: compoundId,
    externalId: cardId,
    projectId: pid,
    parentId: undefined,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.duedate ?? undefined),
    assigneeIds,
    tagIds,
    subtaskCount: undefined,
    createdAt: unixToIso(raw.createdAt),
    updatedAt: unixToIso(raw.lastModified),
    platform: 'nextcloud-deck',
    metadata: strMap({
      stackId: raw.stackId,
      order: raw.order,
      type: raw.type,
      attachmentCount: raw.attachmentCount,
    }),
    raw,
  }
}
