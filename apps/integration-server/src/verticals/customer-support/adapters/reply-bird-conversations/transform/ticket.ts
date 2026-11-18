/**
 * Bird email thread → canonical Ticket.
 *
 * `EmailThread` (https://bird.com/openapi.json, `GET /v1/email/threads` and
 * `GET /v1/email/threads/{thread_id}`; https://bird.com/docs/api/reference/list-email-threads):
 *   "A conversation in a mailbox. It groups every message in both directions"
 *   - `id` (ThreadID, `thr_…`), `mailbox_id` (MailboxID, `mbx_…`)
 *   - `channel`: "Channel this conversation lives on. Always `email`."
 *   - `contact_id`: "Contact linked to this conversation, or null when none is linked."
 *   - `subject`: "Subject of the conversation, taken from its first message. Null when
 *     that message had no subject."
 *   - `labels`: "Exactly one system placement label is always present … `inbox`: The
 *     conversation is in the inbox. `archive`: The conversation was filed away and is
 *     done for now. `spam` … `blocked` … Custom labels share the same list"
 *   - `message_count`, `unread_count`, `last_message_at`, `last_direction`,
 *     `created_at`, `updated_at`
 *
 * Status: Bird has no ticket status. The placement label is the only state it
 * documents: `inbox` → open, `archive` ("filed away and is done for now") →
 * closed, `spam` / `blocked` → unknown. The placement itself is kept in
 * metadata. Priority, assignee and team have no documented source.
 */
import type { Ticket } from '../../../schema'
import { customLabels, labelTagId } from './tag'

export type BirdPlacement = 'inbox' | 'archive' | 'spam' | 'blocked'

/** The four system placement labels; exactly one is on every conversation. */
export const PLACEMENTS: readonly BirdPlacement[] = ['inbox', 'archive', 'spam', 'blocked']

export interface RawBirdThread {
  id: string
  mailbox_id: string
  channel: string
  contact_id: string | null
  subject: string | null
  participants: string[]
  message_count: number
  unread_count: number
  last_message_at: string
  last_direction: 'inbound' | 'outbound'
  labels: string[]
  created_at: string
  updated_at: string
}

const STATUS: Record<BirdPlacement, Ticket['status']> = {
  inbox: 'open',
  archive: 'closed',
  spam: 'unknown',
  blocked: 'unknown',
}

function placementOf(raw: RawBirdThread): BirdPlacement | undefined {
  return PLACEMENTS.find((p) => raw.labels.includes(p))
}

export function transformTicket(raw: RawBirdThread): Ticket {
  const placement = placementOf(raw)
  const metadata: Record<string, string> = {
    mailboxId: raw.mailbox_id,
    messageCount: String(raw.message_count),
    unreadCount: String(raw.unread_count),
    lastMessageAt: raw.last_message_at,
    lastDirection: raw.last_direction,
  }
  if (placement) metadata['placement'] = placement
  return {
    id: raw.id,
    externalId: raw.id,
    subject: raw.subject ?? '',
    status: placement ? STATUS[placement] : 'unknown',
    channel: raw.channel === 'email' ? 'email' : 'unknown',
    requesterId: raw.contact_id ?? '',
    tagIds: customLabels(raw.labels).map((name) => labelTagId(raw.mailbox_id, name)),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    platform: 'reply-bird-conversations',
    metadata,
    raw,
  }
}
