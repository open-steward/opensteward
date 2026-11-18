/**
 * Transform a raw Teamwork Spaces inline comment object into the canonical
 * Comment.
 *
 * Inline comments are anchored to a specific page and returned by:
 *   GET /spaces/api/v1/spaces/{spaceId}/pages/{pageId}/comments/inline.json
 *
 * The response envelope is `{ comments: [{ comment, replies }] }`.
 * Each `comment` object has:
 *   id, content, identifier, isPrivate, parentId, state,
 *   createdAt, createdBy, updatedAt, updatedBy, deletedAt, deletedBy,
 *   page (reference), space (reference), reactions, selection
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import { taskId } from './task'

export interface RawSpacesComment {
  id: number | string
  content?: string
  identifier?: string
  isPrivate?: boolean
  parentId?: number | string | null
  state?: string
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  createdBy?: { id: number | string } | null
  page?: { id: number | string } | null
  space?: { id: number | string } | null
  [key: string]: unknown
}

export function transformComment(
  raw: RawSpacesComment,
  pageId?: string,
  spaceId?: string,
): Comment {
  const id = String(raw.id)
  const resolvedPageId = pageId ?? (raw.page?.id != null ? String(raw.page.id) : undefined)
  const resolvedSpaceId = spaceId ?? (raw.space?.id != null ? String(raw.space.id) : undefined)
  return {
    id,
    externalId: id,
    // Task.id is '{spaceId}:{pageId}' (see transform/task.ts), so a comment
    // points at its task only when both halves are known.
    taskId:
      resolvedSpaceId !== undefined && resolvedPageId !== undefined
        ? taskId(resolvedSpaceId, resolvedPageId)
        : undefined,
    projectId: resolvedSpaceId,
    authorId: raw.createdBy?.id != null ? String(raw.createdBy.id) : '',
    body: pickStr(raw.content) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'teamwork-desk',
    metadata: strMap({
      identifier: raw.identifier,
      isPrivate: raw.isPrivate,
      parentId: raw.parentId,
      state: raw.state,
    }),
    raw,
  }
}
