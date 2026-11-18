/**
 * Papercups message → canonical Message transform.
 *
 * API: GET /api/v1/messages, GET /api/v1/messages/:id
 * Response envelope: { data: RawPapercupsMessage }
 *
 * A message has either user_id (agent) or customer_id (end-user).
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPapercupsMessage {
  id: string
  account_id?: string
  conversation_id?: string
  body?: string
  type?: string
  private?: boolean
  seen_at?: string | null
  sent_at?: string | null
  created_at?: string
  user_id?: string | null
  customer_id?: string | null
  attachments?: Array<{ id?: string; file_name?: string }>
  user?: { id?: string; email?: string; role?: string }
  [key: string]: unknown
}

export function transformMessage(raw: RawPapercupsMessage, conversationId: string): Message {
  const isPrivate = raw.private === true
  const type: MessageType = isPrivate ? 'internal' : 'public'
  // Papercups messages are from an agent (user_id set) or a customer (customer_id set)
  const authorType: AuthorType = raw.user_id ? 'user' : 'contact'
  const authorId = raw.user_id ? String(raw.user_id) : (raw.customer_id ? String(raw.customer_id) : '')
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId: conversationId,
    authorId,
    authorType,
    body: pickStr(raw.body) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'papercups',
    metadata: strMap({
      sentAt: raw.sent_at,
      seenAt: raw.seen_at,
      messageType: raw.type,
    }),
    raw,
  }
}
