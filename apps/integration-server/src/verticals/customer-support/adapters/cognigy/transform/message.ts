/**
 * Transform a Cognigy Live Agent (Chatwoot) message into the canonical
 * Message schema.
 *
 * Wire shape: message object from
 *   GET /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
 *
 * message_type values: 0=incoming (contact), 1=outgoing (agent), 2=activity, 3=template
 * private: true  → internal note
 * Timestamps: Unix epoch integers (seconds).
 * Attachments: array of attachment objects — only count is surfaced.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Minimal sender shape embedded in message */
interface MsgSender {
  id?: number
  type?: string  // 'contact' | 'user' | 'agent_bot'
  [key: string]: unknown
}

export interface RawCognigyMessage {
  id: number
  content?: string | null
  message_type?: number
  private?: boolean
  /** Unix epoch seconds */
  created_at?: number
  sender_id?: number
  sender?: MsgSender | null
  conversation_id?: number
  attachments?: unknown[]
  [key: string]: unknown
}

/** Chatwoot message_type integer → internal/public */
function mapType(msgType: number | undefined, isPrivate: boolean | undefined): MessageType {
  if (isPrivate === true) return 'internal'
  if (msgType === 2) return 'internal'  // activity messages are system/internal
  return 'public'
}

/** Derive AuthorType from Chatwoot sender type string */
function mapAuthorType(sender: MsgSender | null | undefined, msgType: number | undefined): AuthorType {
  if (msgType === 2) return 'system'  // activity
  const sType = sender?.type?.toLowerCase() ?? ''
  if (sType === 'contact') return 'contact'
  if (sType === 'user' || sType === 'agent') return 'user'
  if (sType === 'agent_bot' || sType === 'agentbot') return 'system'
  // fallback: incoming (0) = contact, outgoing (1) = agent
  if (msgType === 0) return 'contact'
  if (msgType === 1) return 'user'
  return 'user'
}

/** Unix epoch seconds to ISO-8601 */
function epochToIso(epoch: number | undefined): string | undefined {
  if (!epoch) return undefined
  return new Date(epoch * 1000).toISOString()
}

export function transformMessage(raw: RawCognigyMessage, ticketId: string): Message {
  const type = mapType(raw.message_type, raw.private)
  const authorType = mapAuthorType(raw.sender, raw.message_type)
  const senderId = raw.sender?.id ?? raw.sender_id
  const createdAt = epochToIso(raw.created_at) ?? toIso(raw.created_at) ?? new Date(0).toISOString()
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: senderId != null ? String(senderId) : '',
    authorType,
    body: pickStr(raw.content) ?? '',
    type,
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : undefined,
    createdAt,
    platform: 'cognigy',
    metadata: strMap({
      messageType: raw.message_type,
      isPrivate: raw.private,
    }),
    raw,
  }
}
