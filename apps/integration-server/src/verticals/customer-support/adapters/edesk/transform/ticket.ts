/**
 * Transform eDesk ticket raw API response to the canonical Ticket schema.
 *
 * eDesk ticket fields (v1):
 *   id, subject, status, channel_id, contact_id, owner_user_id, tags_ids,
 *   messages_ids, type, created_at, last_updated_at, sales_order_id,
 *   external_order_id, custom_fields, time_left_to_reply, uri
 *
 * Status values: Scheduled | Spam | Unread | Read | Unpriorty | Priority |
 *   Archived | Open | Pending | Closed
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawEdeskTicket {
  id: number | string
  subject?: string | null
  status?: string | null
  channel_id?: number | null
  contact_id?: number | null
  owner_user_id?: number | null
  tags_ids?: Array<number | string> | null
  messages_ids?: Array<number | string> | null
  type?: string | null
  created_at?: string | null
  last_updated_at?: string | null
  sales_order_id?: number | null
  external_order_id?: string | null
  custom_fields?: Record<string, unknown> | null
  time_left_to_reply?: number | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  if (!s) return 'open'
  const lower = s.toLowerCase()
  switch (lower) {
    case 'open':
    case 'unread':
    case 'read':
    case 'unpriorty':
    case 'priority':
    case 'scheduled':
    case 'archived':
      return 'open'
    case 'pending':
      return 'pending'
    case 'closed':
      return 'closed'
    case 'spam':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(type: string | null | undefined): Channel {
  if (!type) return 'other'
  const lower = type.toLowerCase()
  if (lower.includes('email') || lower === 'order' || lower === 'refund' || lower === 'invoice') return 'email'
  if (lower === 'chat' || lower === 'livechat') return 'chat'
  if (lower === 'facebook' || lower === 'twitter' || lower.includes('social')) return 'social'
  if (lower === 'sms') return 'sms'
  if (lower === 'voice' || lower === 'phone') return 'voice'
  return 'other'
}

export function transformTicket(raw: RawEdeskTicket): Ticket {
  const status = mapStatus(raw.status)
  const tagIds = (raw.tags_ids ?? []).map(String)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    channel: mapChannel(raw.type),
    requesterId: raw.contact_id != null ? String(raw.contact_id) : '',
    assigneeId: raw.owner_user_id != null ? String(raw.owner_user_id) : undefined,
    tagIds,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.last_updated_at),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.last_updated_at) : undefined,
    closedAt: status === 'closed' ? toIso(raw.last_updated_at) : undefined,
    platform: 'edesk',
    metadata: strMap({
      channelId: raw.channel_id,
      ticketType: raw.type,
      salesOrderId: raw.sales_order_id,
      externalOrderId: raw.external_order_id,
      timeLeftToReply: raw.time_left_to_reply,
    }),
    raw,
  }
}
