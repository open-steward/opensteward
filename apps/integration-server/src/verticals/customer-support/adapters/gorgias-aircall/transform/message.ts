/**
 * Pylon Message → canonical Message transform.
 *
 * Messages are fetched from GET /issues/{id}/messages.
 * is_private=true → internal note; false → public reply.
 * author is a nested object with id and email.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPylonMessage {
  id: string
  message_html?: string
  author?: { id?: string; email?: string; type?: string } | null
  timestamp?: string
  is_private?: boolean
  source?: string
  thread_id?: string | null
  file_urls?: string[]
  [key: string]: unknown
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function transformMessage(raw: RawPylonMessage, ticketId: string): Message {
  const type: MessageType = raw.is_private === true ? 'internal' : 'public'
  // Pylon author.type can be 'user' (agent) or 'contact' (customer)
  const rawAuthorType = raw.author?.type
  const authorType: AuthorType =
    rawAuthorType === 'user' ? 'user' :
    rawAuthorType === 'contact' ? 'contact' :
    'user'
  const htmlBody = pickStr(raw.message_html)
  const body = htmlBody ? stripHtml(htmlBody) : ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: pickStr(raw.author?.id) ?? '',
    authorType,
    body,
    type,
    attachmentCount: raw.file_urls?.length,
    createdAt: toIso(raw.timestamp) ?? new Date(0).toISOString(),
    platform: 'gorgias-aircall',
    metadata: strMap({
      source: raw.source,
      threadId: raw.thread_id,
    }),
    raw,
  }
}
