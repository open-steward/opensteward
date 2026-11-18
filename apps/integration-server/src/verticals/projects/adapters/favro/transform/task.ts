import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Favro card. Cards live on a widget (board) and carry an `assignments` array
 * (`{ userId, completed }`), `tags` (tag ids), `parentCardId` (subtask
 * pointer), and ISO-8601 `startDate` / `dueDate`. Favro has no native status
 * enum on the card; completion is derived from the assignments (all assignees
 * marked `completed`). `detailedDescription` is the markdown body. There is no
 * card-level priority field in Favro, so `priority` is left undefined.
 */
export interface RawFavroCard {
  cardId: string
  cardCommonId?: string
  organizationId?: string
  widgetCommonId?: string
  columnId?: string
  laneId?: string
  parentCardId?: string | null
  name?: string
  detailedDescription?: string
  tags?: string[]
  sequentialId?: number
  startDate?: string | null
  dueDate?: string | null
  assignments?: Array<{ userId: string; completed?: boolean }>
  numComments?: number
  tasksTotal?: number
  tasksDone?: number
  archived?: boolean
  [key: string]: unknown
}

function mapStatus(raw: RawFavroCard): TaskStatus {
  const assignments = raw.assignments ?? []
  if (assignments.length > 0 && assignments.every((a) => a.completed)) return 'closed'
  return 'open'
}

export function transformTask(raw: RawFavroCard, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.widgetCommonId) ?? ''
  // cardCommonId is the stable cross-board identifier; cardId is widget-specific.
  const stableId = pickStr(raw.cardCommonId) ?? raw.cardId
  return {
    id: stableId,
    externalId: stableId,
    projectId: pid,
    parentId: pickStr(raw.parentCardId),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.detailedDescription),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.dueDate),
    assigneeIds: (raw.assignments ?? []).map((a) => a.userId).filter((id): id is string => !!id),
    tagIds: (raw.tags ?? []).filter((t): t is string => typeof t === 'string'),
    subtaskCount: typeof raw.tasksTotal === 'number' ? raw.tasksTotal : undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'favro',
    metadata: strMap({
      platformType: raw.parentCardId ? 'subtask' : 'card',
      cardCommonId: raw.cardCommonId,
      columnId: raw.columnId,
      laneId: raw.laneId,
      sequentialId: raw.sequentialId,
      startDate: toIso(raw.startDate),
      tasksDone: raw.tasksDone,
      tasksTotal: raw.tasksTotal,
      archived: raw.archived,
    }),
    raw,
  }
}
