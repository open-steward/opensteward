/**
 * InvGate Service Management — comment (message) transform.
 *
 * Comment fields from /incident?comments=true response:
 *   id, incident_id, author_id, message, created_at,
 *   customer_visible (1=public, 0=internal), is_solution (0/1),
 *   attachments, reference (reply-to comment id), msg_num
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawInvGateComment {
  id: number
  incident_id?: number | null
  author_id?: number | null
  message?: string | null
  created_at?: string | number | null
  customer_visible?: number | null   // 1=public, 0=internal
  is_solution?: number | null        // 1 if this comment marks the ticket solved
  attachments?: unknown[]
  reference?: number | null
  msg_num?: number | null
  [key: string]: unknown
}

export function transformMessage(raw: RawInvGateComment, ticketId: string): Message {
  // customer_visible: 1 = public reply, 0 = internal note
  const type: MessageType = raw.customer_visible === 0 ? 'internal' : 'public'
  const authorType: AuthorType = 'user'

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: raw.author_id != null ? String(raw.author_id) : '',
    authorType,
    body: pickStr(raw.message) ?? '',
    type,
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'helpcrunch-na',
    metadata: strMap({
      isSolution: raw.is_solution,
      msgNum: raw.msg_num,
      reference: raw.reference,
    }),
    raw,
  }
}
