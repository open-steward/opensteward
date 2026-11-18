import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Favro comment on a card. The text body is `comment`; the author is `userId`;
 * `created` / `lastUpdated` are ISO-8601 dates. Comments are keyed to a card by
 * `cardCommonId`. Attachment content is refused — only the count is surfaced.
 */
export interface RawFavroComment {
  commentId: string
  organizationId?: string
  cardCommonId?: string
  comment?: string
  userId?: string
  created?: string
  lastUpdated?: string
  attachments?: Array<{ name?: string; fileURL?: string }>
  [key: string]: unknown
}

export function transformComment(raw: RawFavroComment, taskId?: string): Comment {
  return {
    id: raw.commentId,
    externalId: raw.commentId,
    taskId: taskId ?? pickStr(raw.cardCommonId),
    projectId: undefined,
    authorId: pickStr(raw.userId) ?? '',
    body: pickStr(raw.comment) ?? '',
    mentions: [],
    attachmentCount: raw.attachments?.length ?? 0,
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.lastUpdated),
    platform: 'favro',
    metadata: strMap({}),
    raw,
  }
}
