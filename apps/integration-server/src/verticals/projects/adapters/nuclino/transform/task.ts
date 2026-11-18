/**
 * Transform a raw Nuclino Item or Collection object into a canonical Task.
 *
 * Nuclino items are documents/pages that live inside a workspace (project).
 * Collections are containers that can hold items and other collections —
 * both are modelled as tasks with the object type captured in metadata.
 *
 * Item object fields:
 *   object, id, workspaceId, url, title,
 *   createdAt, createdUserId,
 *   lastUpdatedAt, lastUpdatedUserId,
 *   fields (items only), content, contentMeta
 *
 * Collection object fields (same except `childIds` instead of `fields`):
 *   object, id, workspaceId, url, title,
 *   createdAt, createdUserId,
 *   lastUpdatedAt, lastUpdatedUserId,
 *   childIds, content, contentMeta
 */
import type { Task } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNuclinoItem {
  object?: string
  id: string
  workspaceId?: string
  url?: string
  title?: string
  createdAt?: string
  createdUserId?: string
  lastUpdatedAt?: string
  lastUpdatedUserId?: string
  /** Present on items (not collections). */
  fields?: Record<string, unknown>
  /** Present on collections (not items). */
  childIds?: string[]
  content?: string
  contentMeta?: { itemIds?: string[]; fileIds?: string[] }
  /** Highlight text returned by search endpoint. */
  highlight?: string
  [key: string]: unknown
}

export function transformTask(raw: RawNuclinoItem, projectId?: string): Task {
  const pid = projectId ?? raw.workspaceId ?? ''
  const isCollection = raw.object === 'collection'
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: undefined,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.content),
    status: 'open',
    priority: undefined,
    dueDate: undefined,
    assigneeIds: raw.createdUserId ? [raw.createdUserId] : [],
    tagIds: [],
    subtaskCount: isCollection ? (raw.childIds?.length ?? 0) : undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.lastUpdatedAt),
    platform: 'nuclino',
    metadata: strMap({
      objectType: raw.object,
      url: raw.url,
      lastUpdatedUserId: raw.lastUpdatedUserId,
    }),
    raw,
  }
}
