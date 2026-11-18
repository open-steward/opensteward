import type { Task, TaskStatus } from '../../../schema'
import { strMap, toIso } from './shared'

/**
 * Meisterplan task (`TaskResponse`) → canonical Task.
 *
 * Tasks are imported into a project from an external task-management tool and
 * read back from
 *   GET /scenarios/{scenarioId}/projects/{projectId}/taskManagementLink/tasks
 *   GET /scenarios/{scenarioId}/projects/{projectId}/taskManagementLink/tasks/{taskId}
 *
 * Every field below is a documented `TaskResponse` property in
 * https://api.us.meisterplan.com/swagger.json (rendered at
 * https://api.us.meisterplan.com/docs/api.html#tag/Task-Management):
 *   id, key, name, status ("OPEN" | "CLOSED" | "IN_PROGRESS"), externalViewUrl,
 *   rank, startDate (date), dueDate (date), effort { assignments[] { entity
 *   { id, type: ROLE | RESOURCE | TEAM | RESOLVE_BY_KEY_OR_NAME } } },
 *   sprint { id, key }, type ("TASK" | "MILESTONE").
 * The response carries no description and no created/updated timestamps.
 */
export interface RawMeisterplanTask {
  id?: string | null
  key?: string | null
  name?: string | null
  status?: string | null
  externalViewUrl?: string | null
  rank?: number | null
  startDate?: string | null
  dueDate?: string | null
  effort?: {
    assignments?: Array<{
      entity?: { id?: string | null; type?: string | null } | null
    }> | null
  } | null
  sprint?: { id?: string | null; key?: string | null } | null
  type?: string | null
  [key: string]: unknown
}

/** The documented `TaskResponse.status` enum: OPEN, CLOSED, IN_PROGRESS. */
const STATUS: Record<string, TaskStatus> = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
}

export function transformTask(
  raw: RawMeisterplanTask,
  projectId: string,
  scenarioId?: string,
): Task {
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('Meisterplan task response has no id')
  }
  if (typeof raw.name !== 'string') {
    throw new Error(`Meisterplan task ${raw.id} has no name`)
  }
  // Resources are the canonical users; ROLE / TEAM assignments are not people.
  const assigneeIds = (raw.effort?.assignments ?? [])
    .map((a) => a.entity)
    .filter((e) => e?.type === 'RESOURCE' && typeof e.id === 'string' && e.id.length > 0)
    .map((e) => e!.id as string)

  return {
    id: raw.id,
    externalId: raw.id,
    projectId,
    title: raw.name,
    status: (raw.status && STATUS[raw.status]) || 'unknown',
    dueDate: toIso(raw.dueDate),
    assigneeIds: [...new Set(assigneeIds)],
    tagIds: [],
    platform: 'meisterplan',
    metadata: strMap({
      scenarioId,
      key: raw.key,
      statusRaw: raw.status,
      type: raw.type,
      startDate: raw.startDate,
      rank: raw.rank,
      externalViewUrl: raw.externalViewUrl,
      sprintId: raw.sprint?.id,
      sprintKey: raw.sprint?.key,
    }),
    raw,
  }
}
