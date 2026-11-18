/**
 * Transform a Ruddr task tag into the canonical Tag schema.
 *
 * GET /task-tags returns `TaskTag` rows: `id` ("The unique identifier for
 * the object."), `name` ("The name of the task tag."), `isActive`
 * ("Whether the task tag is active.") and `createdAt` ("The timestamp when
 * the object was created.") (https://docs.ruddr.io/openapi.json, TaskTag).
 * The documented `name` is required by the canonical Tag: a row without one
 * is refused rather than given an empty name.
 *
 * Ruddr documents no workspace id anywhere in its API, so the canonical
 * `workspaceId` is the one the caller scoped the list to. It is required:
 * an empty one is refused rather than invented.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawRuddrTag {
  id: string
  name?: string
  isActive?: boolean
  createdAt?: string
  [key: string]: unknown
}

export function transformTag(raw: RawRuddrTag, workspaceId: string): Tag {
  if (!workspaceId) {
    throw new Error(`Ruddr tag ${raw.id}: a workspaceId is required (Ruddr documents none)`)
  }
  const name = pickStr(raw.name)
  if (!name) throw new Error(`Ruddr tag ${raw.id} has no name`)
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId,
    name,
    color: undefined,
    platform: 'ruddr',
    metadata: strMap({ isActive: raw.isActive, createdAt: raw.createdAt }),
    raw,
  }
}
