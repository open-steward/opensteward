/**
 * Kaiten card-comment → canonical Comment.
 *
 * Comment fields (from GET /cards/{card_id}/comments):
 *   id, uid, text, type (1=markdown, 2=html),
 *   card_id, author_id, author (nested user object),
 *   created, updated, edited, internal, deleted
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKaitenComment {
  id: number
  uid?: string
  text?: string
  /** 1 = markdown, 2 = html */
  type?: number
  card_id?: number
  author_id?: number
  author?: { id?: number; full_name?: string; email?: string } | null
  created?: string
  updated?: string
  edited?: boolean
  internal?: boolean
  deleted?: boolean
  [key: string]: unknown
}

export function transformComment(raw: RawKaitenComment, taskId?: string): Comment {
  const id = String(raw.id)
  const resolvedTaskId = taskId ?? (raw.card_id != null ? String(raw.card_id) : undefined)
  const authorId =
    raw.author_id != null
      ? String(raw.author_id)
      : raw.author?.id != null
        ? String(raw.author.id)
        : ''

  return {
    id,
    externalId: id,
    taskId: resolvedTaskId,
    projectId: undefined,
    authorId,
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    platform: 'kaiten',
    metadata: strMap({
      uid: raw.uid,
      type: raw.type,
      internal: raw.internal,
      edited: raw.edited,
    }),
    raw,
  }
}
