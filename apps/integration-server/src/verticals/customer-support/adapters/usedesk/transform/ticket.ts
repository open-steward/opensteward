/**
 * UseDesk ticket transform.
 *
 * Ticket list response (POST /uapi/tickets) returns an array of ticket objects.
 * Status IDs 1-9 are mapped to canonical TicketStatus values per API docs:
 *   1 = open      → 'open'
 *   2 = executed  → 'resolved'  (work done, awaiting client confirmation)
 *   3 = closed    → 'closed'
 *   4 = deleted   → 'closed'    (removed from system)
 *   5 = on_hold   → 'on_hold'
 *   6 = pending   → 'pending'   (awaiting external action)
 *   7 = spam      → 'closed'
 *   8 = new       → 'open'
 *   9 = mailing   → 'open'
 *
 * Priority: "low" | "medium" | "urgent" | "extreme" on the wire.
 * Channel: derived from channel_id (no channel name returned in list endpoint).
 * Tags: embedded `tags` array of { name: string } objects.
 *
 * Docs: https://api.usedocs.com/article/51376
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** A ticket's embedded tag: article 51376, "tags Array of tags name — tag name". */
export interface RawUsedeskTicketTag {
  name?: string
  [key: string]: unknown
}

export interface RawUsedeskTicket {
  /** Numeric ticket ID */
  id: number | string
  subject?: string
  /** Numeric status ID: 1=open, 2=pending/on-hold, 3=resolved, 4=closed, 5=new */
  status?: number | string
  /** Priority string: low | medium | urgent | extreme */
  priority?: string | null
  /** Client (requester) ID */
  client_id?: number | string | null
  client_name?: string | null
  /** Assigned agent ID */
  assignee_id?: number | string | null
  /** Group / team ID */
  group?: number | string | null
  /** Channel ID (numeric; no name returned in list endpoint) */
  channel_id?: number | string | null
  /** Tags embedded in the ticket */
  tags?: RawUsedeskTicketTag[]
  created_at?: string
  last_updated_at?: string
  [key: string]: unknown
}

/** UseDesk numeric status_id → canonical TicketStatus (per api.usedocs.com/article/51376) */
function mapStatus(s: number | string | undefined): TicketStatus {
  const n = typeof s === 'string' ? Number(s) : (s ?? 0)
  switch (n) {
    case 1:
      return 'open'
    case 2:
      return 'resolved' // "executed" — work done, awaiting client confirmation
    case 3:
      return 'closed'
    case 4:
      return 'closed' // "deleted"
    case 5:
      return 'on_hold'
    case 6:
      return 'pending'
    case 7:
      return 'closed' // "spam"
    case 8:
      return 'open' // "new"
    case 9:
      return 'open' // "mailing"
    default:
      return 'open'
  }
}

/** UseDesk priority string → canonical TicketPriority */
function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (p === 'low') return 'low'
  if (p === 'medium') return 'normal'
  if (p === 'urgent') return 'urgent'
  if (p === 'extreme') return 'urgent'
  return undefined
}

/**
 * UseDesk does not return a channel name in the tickets list; only a numeric
 * channel_id is present. We default to 'other' — callers who need the actual
 * channel type should fetch the channel list separately.
 */
function mapChannel(_channelId: number | string | null | undefined): Channel {
  return 'other'
}

export function transformTicket(raw: RawUsedeskTicket): Ticket {
  const status = mapStatus(raw.status)
  const tagIds = (raw.tags ?? []).map((t) => pickStr(t.name) ?? '').filter(Boolean)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.channel_id),
    requesterId: raw.client_id ? String(raw.client_id) : '',
    assigneeId: raw.assignee_id ? String(raw.assignee_id) : undefined,
    teamId: raw.group ? String(raw.group) : undefined,
    tagIds,
    satisfactionRating: undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.last_updated_at),
    resolvedAt:
      status === 'resolved' || status === 'closed' ? toIso(raw.last_updated_at) : undefined,
    platform: 'usedesk',
    metadata: strMap({
      channelId: raw.channel_id,
      clientName: raw.client_name,
    }),
    raw,
  }
}
