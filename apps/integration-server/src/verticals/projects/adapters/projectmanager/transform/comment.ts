/**
 * ProjectManager discussion comment → canonical Comment transform.
 *
 * DiscussionCommentDto fields (v4):
 *   id (uuid), text (Markdown), authorId, authorName,
 *   createDate, modifyDate
 *
 * Docs: https://developer.projectmanager.com/api-reference/discussion/retrieve-task-comments
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawProjectManagerComment {
  id: string
  text?: string | null
  authorId?: string | null
  authorName?: string | null
  createDate?: string | null
  modifyDate?: string | null
  [key: string]: unknown
}

export function transformComment(
  raw: RawProjectManagerComment,
  taskId?: string,
): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId,
    projectId: undefined,
    authorId: pickStr(raw.authorId ?? undefined) ?? '',
    body: pickStr(raw.text ?? undefined) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createDate) ?? new Date(0).toISOString(),
    platform: 'projectmanager',
    metadata: strMap({ authorName: raw.authorName }),
    raw,
  }
}
