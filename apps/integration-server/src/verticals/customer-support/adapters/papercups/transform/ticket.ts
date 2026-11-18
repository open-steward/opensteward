/**
 * Papercups conversation → canonical Ticket transform.
 *
 * Papercups calls these "conversations". The API returns them at
 * GET /api/v1/conversations and GET /api/v1/conversations/:id.
 *
 * Response envelope: { data: RawPapercupsConversation }
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPapercupsConversation {
  id: string
  account_id?: string
  assignee_id?: string | null
  customer_id?: string
  priority?: string | null
  read?: boolean
  source?: string | null
  status?: string
  closed_at?: string | null
  created_at?: string
  updated_at?: string | null
  customer?: {
    id?: string
    name?: string
    email?: string
    phone?: string | null
  }
  messages?: unknown[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  // Papercups uses a 5-level priority: not_urgent | low | medium | high | urgent.
  // Map to canonical TicketPriority; 'medium' maps to canonical 'normal'.
  switch (p) {
    case 'not_urgent': return 'low'
    case 'low':        return 'low'
    case 'medium':     return 'normal'
    case 'high':       return 'high'
    case 'urgent':     return 'urgent'
    default:           return undefined
  }
}

function mapSource(s: string | null | undefined): Channel {
  switch (s) {
    case 'email':
      return 'email'
    case 'chat':
    case 'widget':
    case 'web':
      return 'chat'
    case 'sms':
      return 'sms'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawPapercupsConversation): Ticket {
  const status = mapStatus(raw.status)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    subject: pickStr(raw.id) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapSource(raw.source),
    requesterId: raw.customer_id ? String(raw.customer_id) : '',
    assigneeId: raw.assignee_id ? String(raw.assignee_id) : undefined,
    tagIds: [],
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at ?? undefined),
    resolvedAt: raw.closed_at ? toIso(raw.closed_at) : undefined,
    closedAt: raw.closed_at ? toIso(raw.closed_at) : undefined,
    platform: 'papercups',
    metadata: strMap({
      source: raw.source,
      read: raw.read,
      accountId: raw.account_id,
    }),
    raw,
  }
}
