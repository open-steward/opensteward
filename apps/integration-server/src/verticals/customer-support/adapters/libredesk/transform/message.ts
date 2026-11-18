/**
 * Transforms a Libredesk message into the canonical Message schema.
 *
 * Libredesk message types: "incoming" | "outgoing" | "activity"
 * Private flag: message.private === true  → internal note
 * Sender types: "agent" | "contact"
 *
 * Ref: internal/conversation/models/models.go (Message)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLibredeskMessage {
  id: number
  uuid?: string
  conversation_uuid?: string
  type?: string // "incoming" | "outgoing" | "activity"
  private?: boolean
  sender_id?: number
  sender_type?: string // "agent" | "contact"
  content?: string
  text_content?: string
  content_type?: string // "text" | "html"
  status?: string // "pending" | "sent" | "failed" | "received"
  attachments?: unknown[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapMessageType(raw: RawLibredeskMessage): MessageType {
  if (raw.private === true) return 'internal'
  return 'public'
}

function mapAuthorType(senderType: string | undefined): AuthorType {
  if (senderType === 'agent') return 'user'
  if (senderType === 'contact') return 'contact'
  return 'unknown'
}

export function transformMessage(raw: RawLibredeskMessage, conversationId: string): Message {
  return {
    id: String(raw.id),
    externalId: raw.uuid ?? String(raw.id),
    ticketId: conversationId,
    authorId: raw.sender_id != null ? String(raw.sender_id) : '',
    authorType: mapAuthorType(raw.sender_type),
    body: pickStr(raw.text_content) ?? pickStr(raw.content) ?? '',
    type: mapMessageType(raw),
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'libredesk',
    metadata: strMap({
      messageType: raw.type,
      contentType: raw.content_type,
      status: raw.status,
      senderType: raw.sender_type,
    }),
    raw,
  }
}
