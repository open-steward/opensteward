/**
 * One entry of GET /api/v1/tickets/{ticket_id}/conversations → canonical
 * Message. "This API lists a particular number of threads and comments
 * recorded on a ticket"; each entry carries `type: "thread"` or
 * `type: "comment"` (https://desk.zoho.com/DeskAPIDocument, Threads).
 *
 * - Thread: author in `author` (`type` END_USER or AGENT, no id); an agent's
 *   outgoing thread carries `responderId`. The list gives `summary`, not the
 *   full `content` (that needs GET .../threads/{thread_id}), so the body is
 *   the summary and metadata says so. `visibility` is "public" or "private".
 * - Comment: `content`, `commenterId`, `commenter.type`, `isPublic`,
 *   `commentedTime`.
 *
 * A thread's `status` ("SUCCESS", or "DRAFT" for an unsent reply in the
 * reference's examples) goes to `metadata.threadStatus` so drafts can be told
 * apart.
 *
 * An end user's thread names no author id, so `authorId` is empty there
 * rather than an email address passed off as an id.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickNum, pickStr, strMap, toIso } from './shared'

interface RawZohoDeskAuthor {
  type?: string | null
  [key: string]: unknown
}

export interface RawZohoDeskConversation {
  id: string | number
  type?: string | null
  // thread fields
  summary?: string | null
  content?: string | null
  visibility?: string | null
  author?: RawZohoDeskAuthor | null
  responderId?: string | null
  channel?: string | null
  direction?: string | null
  /** Thread delivery state; the examples show "SUCCESS" and "DRAFT". */
  status?: string | null
  attachmentCount?: string | number | null
  createdTime?: string | null
  // comment fields
  isPublic?: boolean | string | null
  commenterId?: string | null
  commenter?: RawZohoDeskAuthor | null
  commentedTime?: string | null
  [key: string]: unknown
}

function mapAuthorType(t: string | null | undefined): AuthorType {
  switch ((t ?? '').toUpperCase()) {
    case 'END_USER':
      return 'contact'
    case 'AGENT':
      return 'user'
    default:
      return 'unknown'
  }
}

export function transformMessage(raw: RawZohoDeskConversation, ticketId: string): Message {
  const id = String(raw.id)
  if (raw.type === 'comment') {
    const internal = raw.isPublic === false || raw.isPublic === 'false'
    const type: MessageType = internal ? 'internal' : 'public'
    return {
      id,
      externalId: id,
      ticketId,
      authorId: pickStr(raw.commenterId) ?? '',
      authorType: mapAuthorType(raw.commenter?.type),
      body: pickStr(raw.content) ?? '',
      type,
      createdAt: toIso(raw.commentedTime) ?? new Date(0).toISOString(),
      platform: 'zoho-desk',
      metadata: strMap({ conversationType: 'comment' }),
      raw,
    }
  }
  const type: MessageType =
    (raw.visibility ?? '').toLowerCase() === 'private' ? 'internal' : 'public'
  const count = pickNum(raw.attachmentCount)
  return {
    id,
    externalId: id,
    ticketId,
    authorId: pickStr(raw.responderId) ?? '',
    authorType: mapAuthorType(raw.author?.type),
    body: pickStr(raw.content) ?? pickStr(raw.summary) ?? '',
    type,
    attachmentCount:
      count !== undefined && Number.isInteger(count) && count >= 0 ? count : undefined,
    createdAt: toIso(raw.createdTime) ?? new Date(0).toISOString(),
    platform: 'zoho-desk',
    metadata: strMap({
      conversationType: 'thread',
      bodyIsSummary: raw.content == null ? 'true' : undefined,
      channel: raw.channel,
      direction: raw.direction,
      threadStatus: raw.status,
    }),
    raw,
  }
}
