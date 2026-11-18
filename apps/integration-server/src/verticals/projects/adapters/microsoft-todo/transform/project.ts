import type { Project } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Microsoft To Do has a single level of grouping — the `todoTaskList`. Each
 * list is the container that tasks belong to, so it maps onto the canonical
 * `Project`. Built-in lists (`defaultList`, `flaggedEmails`) are surfaced
 * alongside user-created lists.
 *
 * Lists carry no description, owner, lifecycle status, or timestamps, so
 * those optional canonical fields are omitted (missing-rather-than-wrong).
 */
export interface RawTodoTaskList {
  id: string
  displayName?: string
  isOwner?: boolean
  isShared?: boolean
  wellknownListName?: string
  [key: string]: unknown
}

export function transformProject(raw: RawTodoTaskList, workspaceId = 'me'): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId,
    name: pickStr(raw.displayName) ?? '',
    status: 'active',
    platform: 'microsoft-todo',
    metadata: strMap({
      isOwner: raw.isOwner,
      isShared: raw.isShared,
      wellknownListName: raw.wellknownListName,
    }),
    raw,
  }
}
