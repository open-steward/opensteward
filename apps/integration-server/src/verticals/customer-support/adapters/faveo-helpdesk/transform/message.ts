/**
 * Transform one Faveo Helpdesk v3 ticket thread into the canonical Message schema.
 *
 * Source: GET v3/api/agent/ticket-threads/{ticketId}
 * https://developers.faveohelpdesk.com/ticket-threads-2/
 *
 * The documented thread object carries exactly:
 *   "id": 2249, "user_id": null, "title": "...", "body": "...",
 *   "created_at": "2018-03-20 05:17:24", "attach": [{ "id", "name", "file", "type" }]
 *
 * It documents no poster / sender role and no internal-note flag, so
 * authorType and type are 'unknown' rather than guessed. The documented
 * example has `"user_id": null`; such a thread has no author id and maps to
 * authorId ''. Attachment content (`file`, base64) is refused by the schema
 * firewall — only the count is surfaced, and `attach` is stripped from `raw`.
 */
import type { Message } from '../../../schema'
import { faveoDateTime } from './shared'

export interface RawFaveoThreadAttachment {
  id: number
  name?: string | null
  file?: string | null
  type?: string | null
}

export interface RawFaveoThread {
  id: number
  user_id: number | null
  title?: string | null
  body: string
  created_at: string
  attach?: RawFaveoThreadAttachment[] | null
}

export function transformMessage(raw: RawFaveoThread, ticketId: string): Message {
  const { attach, ...rest } = raw
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: raw.user_id === null ? '' : String(raw.user_id),
    authorType: 'unknown',
    body: raw.body,
    type: 'unknown',
    ...(Array.isArray(attach) ? { attachmentCount: attach.length } : {}),
    createdAt: faveoDateTime(raw.created_at, `thread ${raw.id} created_at`),
    platform: 'faveo-helpdesk',
    metadata: raw.title ? { title: raw.title } : {},
    raw: rest,
  }
}
