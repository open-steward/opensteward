import type { Project, ProjectStatus } from '../../../schema'
import { epochMsToIso, nonEmpty, strMap } from './shared'

/**
 * A Twproject root task, read with `{ command: "list", object: "task",
 * filters: { isProject: true } }` (task filter `isProject`: "\"true\" for
 * project, \"false\" for task/subtask") or `{ command: "get", object: "task",
 * id }`.
 *
 * Fields are those of the documented task response example
 * (https://twproject.com/support/api/returnSamples.json, `task.list`).
 */
export interface RawTwprojectTaskObject {
  /** Returned as a string, e.g. "7923". */
  id: string | number
  code?: string
  name?: string
  description?: string
  /** taskStatusType: STATUS_UNDEFINED, STATUS_ACTIVE, STATUS_SUSPENDED, STATUS_WAITING, STATUS_DONE, STATUS_FAILED */
  status?: string
  tags?: string
  progress?: number
  /** timestamp (ms from Epoch) */
  start?: number
  /** timestamp (ms from Epoch) */
  end?: number
  /** timestamp (ms from Epoch) */
  creationDate?: number
  /** timestamp (ms from Epoch) */
  lastModified?: number
  [key: string]: unknown
}

/**
 * STATUS_WAITING, STATUS_FAILED and STATUS_UNDEFINED have no canonical
 * counterpart and map to 'unknown'; the upstream value is kept in
 * `metadata.status`.
 */
function mapStatus(status: unknown): ProjectStatus {
  switch (status) {
    case 'STATUS_ACTIVE':
      return 'active'
    case 'STATUS_SUSPENDED':
      return 'on_hold'
    case 'STATUS_DONE':
      return 'completed'
    default:
      return 'unknown'
  }
}

/**
 * `workspaceId` is '': Twproject has no workspace object (the documented
 * objectType list has none), so a project belongs to no listable workspace.
 */
export function transformProject(raw: RawTwprojectTaskObject): Project {
  const id = String(raw.id)
  if (typeof raw.name !== 'string') throw new Error(`Twproject task ${id} has no name`)
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: raw.name,
    description: nonEmpty(raw.description),
    status: mapStatus(raw.status),
    startDate: epochMsToIso(raw.start),
    endDate: epochMsToIso(raw.end),
    createdAt: epochMsToIso(raw.creationDate),
    updatedAt: epochMsToIso(raw.lastModified),
    platform: 'twproject',
    metadata: strMap({
      status: raw.status,
      code: raw.code,
      tags: raw.tags,
      progress: raw.progress,
    }),
    raw,
  }
}
