import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Respond.io message object.
 *
 * Docs: https://developers.respond.io/docs/api/8fcf4206c2503-get-a-message
 *       https://developers.respond.io/docs/api/42fc125b57906-messaging
 *
 * Key fields (from integray connector docs):
 *   MessageID, ContactID, ChannelID, Traffic, Message, MessageDetail,
 *   DeliveryStatuses, ChannelMessageID
 */
export interface RawRespondIoMessage {
  /** Unique message identifier */
  messageId?: string | number | null
  id?: string | number | null
  /** Contact that sent or received the message */
  contactId?: number | null
  /** Channel through which the message was sent/received */
  channelId?: number | null
  /** "incoming" | "outgoing" */
  traffic?: string | null
  /** Plain-text body */
  message?: string | null
  /** Structured message payload (type, text, attachment, etc.) */
  messageDetail?: Record<string, unknown> | null
  /** ISO-8601 */
  createdAt?: string | null
  [key: string]: unknown
}

function resolveId(raw: RawRespondIoMessage): string {
  const v = raw.messageId ?? raw.id
  return v != null ? String(v) : ''
}

function resolveBody(raw: RawRespondIoMessage): string {
  if (pickStr(raw.message)) return pickStr(raw.message)!
  const detail = raw.messageDetail
  if (detail && typeof detail === 'object') {
    const text = (detail as Record<string, unknown>)['text']
    if (pickStr(text)) return pickStr(text)!
  }
  return ''
}

function mapAuthorType(traffic: string | null | undefined): AuthorType {
  if (traffic === 'incoming') return 'contact'
  if (traffic === 'outgoing') return 'user'
  return 'system'
}

export function transformMessage(raw: RawRespondIoMessage, conversationId: string): Message {
  return {
    id: resolveId(raw),
    externalId: resolveId(raw),
    ticketId: conversationId,
    authorId: raw.contactId ? String(raw.contactId) : '',
    authorType: mapAuthorType(raw.traffic),
    body: resolveBody(raw),
    type: 'public',
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'respond-io',
    metadata: strMap({ traffic: raw.traffic, channelId: raw.channelId }),
    raw,
  }
}
