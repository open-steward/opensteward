import type { Task, TaskStatus } from '../../../schema'
import type { RawTwprojectTaskObject } from './project'
import { epochMsToIso, nonEmpty, strMap } from './shared'

export type { RawTwprojectTaskObject }

/**
 * STATUS_SUSPENDED, STATUS_WAITING, STATUS_FAILED and STATUS_UNDEFINED have no
 * canonical counterpart and map to 'unknown'; the upstream value is kept in
 * `metadata.status`.
 */
function mapStatus(status: unknown): TaskStatus {
  switch (status) {
    case 'STATUS_ACTIVE':
      return 'open'
    case 'STATUS_DONE':
      return 'closed'
    default:
      return 'unknown'
  }
}

/**
 * A Twproject task below a project, read with `{ command: "list", object:
 * "task", filters: { subtaskOfAncestorId } }`. No documented task response
 * field carries a parent, assignee id or priority (`parentId` is only
 * create/update `data` input), so `parentId`, `priority` and
 * `assigneeIds` stay empty, and `projectId` is the project the list was
 * scoped to. `tags` is a comma-separated label string, not tag ids: it is
 * kept in metadata.
 */
export function transformTask(raw: RawTwprojectTaskObject, projectId: string): Task {
  const id = String(raw.id)
  if (typeof raw.name !== 'string') throw new Error(`Twproject task ${id} has no name`)
  return {
    id,
    externalId: id,
    projectId,
    title: raw.name,
    description: nonEmpty(raw.description),
    status: mapStatus(raw.status),
    dueDate: epochMsToIso(raw.end),
    assigneeIds: [],
    tagIds: [],
    createdAt: epochMsToIso(raw.creationDate),
    updatedAt: epochMsToIso(raw.lastModified),
    platform: 'twproject',
    metadata: strMap({
      status: raw.status,
      code: raw.code,
      tags: raw.tags,
      progress: raw.progress,
      start: epochMsToIso(raw.start),
    }),
    raw,
  }
}
