/**
 * UseDesk ticket comment (message) transform.
 *
 * UseDesk has no comment list endpoint. POST /uapi/ticket "returns a ticket,
 * all comments, tags and a history of changes"; each entry of its `comments`
 * array documents (https://api.usedocs.com/article/51377):
 *   id — "Comment ID"; message — "Comment text"; from — "Who wrote the
 *   comment user; client"; type; user_id — "ID of the user who left the
 *   comment"; client_id — "ID of the client who left the comment";
 *   published_at — "Date and time of comment creation UTC+0 time zone";
 *   files — "Array of attached files".
 *
 * `type` takes the values POST /uapi/create/comment documents for it
 * (https://api.usedocs.com/article/51381): "Comment type public; private."
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawUsedeskComment {
  id: number | string
  message?: string | null
  /** "Who wrote the comment user; client" */
  from?: string | null
  /** "public" | "private" (article 51381) */
  type?: string | null
  user_id?: number | string | null
  client_id?: number | string | null
  ticket_id?: number | string | null
  published_at?: string | null
  files?: unknown[] | null
  [key: string]: unknown
}

function mapType(t: string | null | undefined): MessageType {
  if (t === 'public') return 'public'
  if (t === 'private') return 'internal'
  return 'unknown'
}

function mapAuthorType(from: string | null | undefined): AuthorType {
  if (from === 'user') return 'user'
  if (from === 'client') return 'contact'
  return 'unknown'
}

export function transformMessage(raw: RawUsedeskComment, ticketId: string): Message {
  const createdAt = toIso(raw.published_at)
  if (!createdAt) {
    throw new Error(`UseDesk comment ${String(raw.id)} has no usable published_at`)
  }
  const authorType = mapAuthorType(raw.from)
  const author =
    authorType === 'user' ? raw.user_id : authorType === 'contact' ? raw.client_id : null
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: author == null ? '' : String(author),
    authorType,
    body: pickStr(raw.message) ?? '',
    type: mapType(raw.type),
    attachmentCount: Array.isArray(raw.files) ? raw.files.length : undefined,
    createdAt,
    platform: 'usedesk',
    metadata: strMap({ from: raw.from }),
    raw,
  }
}
