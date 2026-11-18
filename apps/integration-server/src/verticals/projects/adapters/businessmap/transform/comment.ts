/**
 * Businessmap card comment → canonical Comment transform.
 *
 * API v2 GET /cards/{cardId}/comments
 *   →  { data: [ { comment_id, author_id, text, created_at, updated_at } ] }
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawBusinessmapComment {
  comment_id?: number
  author_id?: number
  card_id?: number
  board_id?: number
  text?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawBusinessmapComment,
  taskId?: string,
  projectId?: string,
): Comment {
  const id = String(raw.comment_id ?? '')
  const derivedTaskId = taskId ?? (raw.card_id != null ? String(raw.card_id) : undefined)
  const derivedProjectId = projectId ?? (raw.board_id != null ? String(raw.board_id) : undefined)
  return {
    id,
    externalId: id,
    taskId: derivedTaskId,
    projectId: derivedProjectId,
    authorId: raw.author_id != null ? String(raw.author_id) : '',
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'businessmap',
    metadata: strMap({}),
    raw,
  }
}
