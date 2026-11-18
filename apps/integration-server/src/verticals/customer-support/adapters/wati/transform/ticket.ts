/**
 * WATI "ticket" (conversation) transform.
 *
 * In WATI, a conversation is the per-contact WhatsApp thread. Each conversation
 * has a ticketId which is what maps to the canonical Ticket.id.  Status is
 * conversation-level (open / resolved / pending / etc.).
 *
 * WATI conversations are fetched via the messages endpoint; there is no
 * standalone "list conversations" v3 endpoint — we synthesise a Ticket from
 * the first message returned for a given conversation, or from the contact's
 * wa_id when we list messages.
 *
 * Docs: https://docs.wati.io/reference/get_api-ext-v3-conversations-target-messages
 */
import type { Ticket, TicketStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Minimal shape needed to construct a Ticket from a WATI conversation context. */
export interface RawWatiConversation {
  ticket_id?: string | null
  conversation_id?: string | null
  /** wa_id of the contact (phone number without +) */
  wa_id?: string | null
  contact_name?: string | null
  status?: string | null
  assigned_id?: string | null
  operator_name?: string | null
  created?: string | number | null
  last_updated?: string | number | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'resolved':
    case 'solved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

export function transformTicket(raw: RawWatiConversation): Ticket {
  const id = pickStr(raw.ticket_id) ?? pickStr(raw.conversation_id) ?? ''
  const status = mapStatus(raw.status)
  const createdAt = toIso(raw.created) ?? new Date(0).toISOString()
  const updatedAt = toIso(raw.last_updated)
  return {
    id,
    externalId: id,
    number: id,
    // Subject is not a WATI concept — use the contact's WhatsApp ID or name
    subject: pickStr(raw.contact_name) ?? pickStr(raw.wa_id) ?? '',
    status,
    // WATI is a WhatsApp platform; channel is always chat
    channel: 'chat',
    // requesterId = the contact's wa_id
    requesterId: pickStr(raw.wa_id) ?? '',
    assigneeId: pickStr(raw.assigned_id),
    tagIds: [],
    createdAt,
    updatedAt,
    resolvedAt: status === 'resolved' || status === 'closed' ? updatedAt : undefined,
    platform: 'wati',
    metadata: strMap({
      waId: raw.wa_id,
      operatorName: raw.operator_name,
      rawStatus: raw.status,
    }),
    raw,
  }
}
