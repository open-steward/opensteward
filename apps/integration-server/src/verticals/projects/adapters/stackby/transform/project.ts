import type { Project } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * A Stackby "project" is conceptually a Stack (a spreadsheet-like workspace
 * that groups tables). Stackby's public API does not expose a list-stacks
 * endpoint, so project objects are constructed from the stack + table
 * identifiers supplied by the caller.
 *
 * The canonical `id` is `{stackId}/{tableName}` — the same composite string
 * used as `projectId` in tasks returned by `listTasks`.
 */
export interface RawStackbyStack {
  /** Stackby stack identifier (appears in the stack's URL). */
  stackId: string
  /** Human-readable table name within the stack. */
  tableName: string
  /** Optional display name for the stack. */
  stackName?: string
  [key: string]: unknown
}

export function transformProject(raw: RawStackbyStack): Project {
  const compositeId = `${raw.stackId}/${raw.tableName}`
  return {
    id: compositeId,
    externalId: compositeId,
    workspaceId: raw.stackId,
    name: pickStr(raw.stackName ?? raw.tableName) ?? compositeId,
    status: 'active',
    platform: 'stackby',
    metadata: strMap({
      stackId: raw.stackId,
      tableName: raw.tableName,
    }),
    raw,
  }
}
