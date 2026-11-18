/**
 * Transform a Helpjuice article comment into the canonical Message shape.
 *
 * Helpjuice comments are public by default (no internal flag in API).
 * author_id refers to the commenting user's id.
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHelpjuiceComment {
  id: number
  body?: string | null
  user_id?: number | null
  author_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformMessage(raw: RawHelpjuiceComment, articleId: string): Message {
  const authorType: AuthorType = 'user'
  const authorId = raw.user_id ?? raw.author_id
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId: articleId,
    authorId: authorId ? String(authorId) : '',
    authorType,
    body: pickStr(raw.body) ?? '',
    type: 'public',
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'helpjuice',
    metadata: strMap({}),
    raw,
  }
}
