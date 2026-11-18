/**
 * Missive message → Message
 *
 * Missive messages are fetched from GET /v1/conversations/:id/messages.
 * Each message has a from_field, to_fields, subject, preview, and timestamps.
 * Internal conversation comments are fetched separately from /v1/conversations/:id/comments.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawMissiveEmailField {
  name?: string | null
  address?: string | null
  [key: string]: unknown
}

export interface RawMissiveAttachment {
  id?: string
  filename?: string
  [key: string]: unknown
}

export interface RawMissiveMessage {
  id: string
  subject?: string | null
  preview?: string | null
  /** 'email' | 'comment' | etc. */
  type?: string | null
  draft?: boolean
  from_field?: RawMissiveEmailField | null
  to_fields?: RawMissiveEmailField[]
  cc_fields?: RawMissiveEmailField[]
  bcc_fields?: RawMissiveEmailField[]
  /** Unix epoch seconds or ISO-8601 */
  delivered_at?: number | string | null
  created_at?: number | string | null
  updated_at?: number | string | null
  attachments?: RawMissiveAttachment[]
  [key: string]: unknown
}

/** Unix epoch seconds → ISO-8601, or pass-through ISO string. */
function normTimestamp(v: number | string | null | undefined): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return new Date(v * 1000).toISOString()
  return toIso(v)
}

export function transformMessage(raw: RawMissiveMessage, conversationId: string): Message {
  const messageType = raw.type
  const type: MessageType = messageType === 'comment' ? 'internal' : 'public'
  const authorType: AuthorType = 'user'

  const fromEmail = raw.from_field?.address
  const fromName = raw.from_field?.name
  // Use email address as authorId since Missive messages don't always carry a numeric agent id
  const authorId = pickStr(fromEmail) ?? ''

  const body = pickStr(raw.preview) ?? ''
  const createdAt =
    normTimestamp(raw.delivered_at) ??
    normTimestamp(raw.created_at) ??
    new Date(0).toISOString()

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId: conversationId,
    authorId,
    authorType,
    body,
    type,
    attachmentCount: raw.attachments?.length,
    createdAt,
    platform: 'missive',
    metadata: strMap({
      subject: raw.subject,
      fromName,
      fromEmail,
      messageType: raw.type,
    }),
    raw,
  }
}
