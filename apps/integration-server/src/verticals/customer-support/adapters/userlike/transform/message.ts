/**
 * Transform a Userlike message object into the canonical Message shape.
 *
 * Userlike message id format: "{conversation_id}.{part_id}.{message_id}".
 * sender.type values: "operator" | "contact" | "bot".
 * type values: "message" | "event".
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawUserlikeMessage {
  id?: string
  conversation_id?: number
  body?: string
  sent_at?: string
  type?: string
  sender?: {
    type?: string
    id?: number
  }
  operator_id?: number | null
  operator_name?: string | null
  marked_read_operator?: boolean
  marked_read_contact?: boolean
  url?: string | null
  [key: string]: unknown
}

function mapAuthorType(senderType: string | undefined): AuthorType {
  if (senderType === 'operator') return 'agent'
  if (senderType === 'bot') return 'bot'
  return 'user'
}

export function transformMessage(raw: RawUserlikeMessage, ticketId: string): Message {
  const senderType = raw.sender?.type
  const authorType = mapAuthorType(senderType)
  const authorId =
    raw.sender?.id != null
      ? String(raw.sender.id)
      : raw.operator_id != null
        ? String(raw.operator_id)
        : ''
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.body) ?? '',
    type: 'public',
    createdAt: toIso(raw.sent_at) ?? new Date(0).toISOString(),
    platform: 'userlike',
    metadata: strMap({
      sender_type: senderType,
      operator_name: raw.operator_name,
      message_type: raw.type,
    }),
    raw,
  }
}
