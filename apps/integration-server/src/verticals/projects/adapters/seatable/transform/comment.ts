/**
 * SeaTable row comment → canonical Comment.
 *
 * Endpoint: GET /api-gateway/api/v2/dtables/{base_uuid}/comments/?row_id={row_id}
 *
 * SeaTable comment object fields (documented + observed):
 *   id          — integer comment id
 *   author      — email of commenter (or author object with email/name)
 *   comment     — comment text (plain)
 *   created_at  — ISO-8601 or RFC 2822 datetime
 *   updated_at  — ISO-8601 datetime (optional)
 *   row_id      — 22-char row identifier the comment belongs to
 *   dtable_uuid — base UUID
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSeatableComment {
  id: number | string
  comment?: string
  author?: string | { email?: string; name?: string }
  created_at?: string
  updated_at?: string
  row_id?: string
  dtable_uuid?: string
  [key: string]: unknown
}

function extractAuthorId(raw: RawSeatableComment): string {
  if (typeof raw.author === 'string') return raw.author
  if (raw.author && typeof raw.author === 'object') {
    return pickStr(raw.author.email ?? raw.author.name) ?? ''
  }
  return ''
}

export function transformComment(
  raw: RawSeatableComment,
  rowId?: string,
  baseUuid?: string,
): Comment {
  const taskId = rowId ?? pickStr(raw.row_id)
  const projectId = baseUuid ?? pickStr(raw.dtable_uuid)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId,
    projectId,
    authorId: extractAuthorId(raw),
    body: pickStr(raw.comment) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'seatable',
    metadata: strMap({
      updatedAt: raw.updated_at,
    }),
    raw,
  }
}
