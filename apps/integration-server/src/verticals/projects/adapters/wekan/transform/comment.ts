/**
 * Wekan comment → canonical Comment.
 *
 * Comment fields (from GET /api/boards/:boardId/cards/:cardId/comments):
 *   _id, text, boardId, cardId, userId, createdAt, modifiedAt
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawWekanComment {
  _id: string
  text?: string
  boardId?: string
  cardId?: string
  userId?: string
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformComment(raw: RawWekanComment, cardId?: string, boardId?: string): Comment {
  return {
    id: raw._id,
    externalId: raw._id,
    taskId: cardId ?? pickStr(raw.cardId),
    projectId: boardId ?? pickStr(raw.boardId),
    authorId: raw.userId ?? '',
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.modifiedAt),
    platform: 'wekan',
    metadata: strMap({}),
    raw,
  }
}
