/**
 * Bird thread message → canonical Message.
 *
 * `EmailThreadMessage` (https://bird.com/openapi.json, `GET /v1/email/threads/{thread_id}/messages`;
 * https://bird.com/docs/api/reference/list-email-thread-messages):
 *   "A message in a mailbox conversation, either direction."
 *   - `id`: "Received messages have a `rem_` ID, sent messages an `em_` ID"
 *   - `direction`: "`inbound` means you received it, `outbound` means you sent it."
 *   - `thread_id`: "Conversation this message belongs to."
 *   - `from`: "Sender address."
 *   - `contact_id`: "Contact linked to this message, or null when none is linked."
 *   - `extracted_text`: "Plain-text content of the message with quoted history
 *     stripped. … On list endpoints it is included only when the request sets
 *     `include=extracted_text`. Null when no text could be extracted."
 *   - `attachment_count`: "Number of attachments on the message."
 *   - `occurred_at`: "When the message was received or accepted for sending."
 *
 * Author: an inbound message is the contact's (`contact_id`, empty when none is
 * linked). An outbound one was sent by the mailbox; the API does not say which
 * person sent it, so its author type is `unknown` and its author id empty.
 * The sender address is kept in metadata. Email has no internal notes, so every
 * message is `public`.
 */
import type { Message } from '../../../schema'

export interface RawBirdThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  channel: string
  thread_id: string
  from: string
  subject: string | null
  preview: string | null
  extracted_text?: string | null
  labels: string[]
  status: string | null
  attachment_count: number
  contact_id: string | null
  occurred_at: string
}

export function transformMessage(raw: RawBirdThreadMessage): Message {
  const inbound = raw.direction === 'inbound'
  const metadata: Record<string, string> = { direction: raw.direction, from: raw.from }
  if (raw.status) metadata['deliveryStatus'] = raw.status
  return {
    id: raw.id,
    externalId: raw.id,
    ticketId: raw.thread_id,
    authorId: inbound ? (raw.contact_id ?? '') : '',
    authorType: inbound ? 'contact' : 'unknown',
    body: raw.extracted_text ?? '',
    type: 'public',
    attachmentCount: raw.attachment_count,
    createdAt: raw.occurred_at,
    platform: 'reply-bird-conversations',
    metadata,
    raw,
  }
}
