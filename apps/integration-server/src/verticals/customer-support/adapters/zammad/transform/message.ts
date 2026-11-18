/**
 * Zammad ticket article (message) transform.
 *
 * Endpoint: GET /api/v1/ticket_articles/by_ticket/{ticketId}
 *           GET /api/v1/ticket_articles/{id}
 *
 * Sender values: "Agent", "Customer", "System"
 * internal: true = private note, false = public reply
 *
 * Docs: https://docs.zammad.org/en/latest/api/ticket/articles.html
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZammadArticle {
  id: number
  ticket_id?: number
  /** Resolved sender name: "Agent", "Customer", "System" */
  sender?: string
  sender_id?: number
  /** Resolved article type name: "email", "phone", "note", "web", "sms", etc. */
  type?: string
  type_id?: number
  from?: string | null
  to?: string | null
  cc?: string | null
  subject?: string | null
  body?: string
  content_type?: string
  /** true = internal/private note */
  internal?: boolean
  created_by_id?: number
  updated_by_id?: number
  attachments?: Array<{ id?: number; filename?: string; preferences?: Record<string, unknown> }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAuthorType(raw: RawZammadArticle): AuthorType {
  const sender = (raw.sender ?? '').toLowerCase()
  if (sender === 'agent') return 'user'
  if (sender === 'customer') return 'contact'
  // System messages
  return 'system'
}

export function transformMessage(raw: RawZammadArticle, ticketId: string): Message {
  const type: MessageType = raw.internal === true ? 'internal' : 'public'
  const authorType = mapAuthorType(raw)
  // Prefer the created_by_id (the actual author); fall back to sender label
  const authorId = raw.created_by_id !== undefined ? String(raw.created_by_id) : ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId: raw.ticket_id !== undefined ? String(raw.ticket_id) : ticketId,
    authorId,
    authorType,
    body: pickStr(raw.body) ?? '',
    type,
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'zammad',
    metadata: strMap({
      sender: raw.sender,
      articleType: raw.type,
      contentType: raw.content_type,
      from: raw.from,
      subject: raw.subject,
    }),
    raw,
  }
}
