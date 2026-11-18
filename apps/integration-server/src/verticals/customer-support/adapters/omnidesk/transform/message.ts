/**
 * Transforms an Omnidesk case message (reply or note) to the canonical Message schema.
 *
 * Messages are fetched from /cases/{id}/messages.json.
 * The `note` boolean indicates whether the message is an internal note.
 * `user_id` is set for contact-authored messages; `staff_id` for agent-authored ones.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawOmnideskMessage {
  message_id: number
  user_id?: number | null
  staff_id?: number | null
  content?: string
  content_html?: string
  note?: boolean
  attachments?: Array<{ file_id?: number; file_name?: string; url?: string }>
  created_at?: string
  sent_at?: string | null
  [key: string]: unknown
}

export function transformMessage(raw: RawOmnideskMessage, ticketId: string): Message {
  const type: MessageType = raw.note === true ? 'internal' : 'public'
  // staff_id present → staff/agent ('user' in canonical schema); user_id present → customer ('contact')
  const authorType: AuthorType = raw.staff_id ? 'user' : 'contact'
  const authorId = raw.staff_id ? String(raw.staff_id) : raw.user_id ? String(raw.user_id) : ''
  return {
    id: String(raw.message_id),
    externalId: String(raw.message_id),
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.content) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.created_at) ?? toIso(raw.sent_at) ?? new Date(0).toISOString(),
    platform: 'omnidesk',
    metadata: strMap({ sentAt: raw.sent_at }),
    raw,
  }
}
