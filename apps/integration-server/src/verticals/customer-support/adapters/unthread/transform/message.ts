/**
 * Transform an Unthread message object into the canonical Message schema.
 *
 * Unthread messages live under /conversations/:id/messages/list.
 * Body content arrives as HTML or markdown — we prefer the plain text
 * extracted from initialMessage.text when available; otherwise fall back
 * to the raw body string.
 *
 * isPrivateNote distinguishes internal (private) from public messages.
 * authorId maps to the sending user's id; author type is inferred:
 *   - if senderUserId is set -> 'user' (agent)
 *   - else 'contact' (customer / external party)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawUnthreadMessageBody {
  type?: string
  value?: string
  [key: string]: unknown
}

export interface RawUnthreadMessage {
  id: string
  conversationId?: string | null
  /** Text of the message; may be set for older API responses */
  text?: string | null
  /** Structured body object with type + value */
  body?: RawUnthreadMessageBody | string | null
  isPrivateNote?: boolean | null
  isAutoresponse?: boolean | null
  /** ID of the user (agent) who sent the message */
  senderUserId?: string | null
  /** Unthread customer/contact id (for customer-originated messages) */
  customerId?: string | null
  files?: Array<{ id?: string }> | null
  createdAt?: string | null
  [key: string]: unknown
}

function extractBody(raw: RawUnthreadMessage): string {
  if (raw.text) return raw.text
  if (!raw.body) return ''
  if (typeof raw.body === 'string') return raw.body
  return pickStr(raw.body.value) ?? ''
}

export function transformMessage(raw: RawUnthreadMessage, ticketId: string): Message {
  const type: MessageType = raw.isPrivateNote ? 'internal' : 'public'
  const authorType: AuthorType = raw.senderUserId ? 'user' : 'contact'
  const authorId = pickStr(raw.senderUserId) ?? pickStr(raw.customerId) ?? ''

  return {
    id: raw.id,
    externalId: raw.id,
    ticketId,
    authorId,
    authorType,
    body: extractBody(raw),
    type,
    attachmentCount: raw.files?.length ?? 0,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'unthread',
    metadata: strMap({ isAutoresponse: raw.isAutoresponse }),
    raw,
  }
}
