/**
 * Transform HelpDesk (by LiveChat) ticket to canonical Ticket.
 *
 * HelpDesk ticket status values: open | pending | onhold | solved | closed
 * HelpDesk ticket priority:      -10 (low) | 0 (medium) | 10 (high) | 20 (urgent)
 * HelpDesk ticket source:        string (email | chat | form | api | widget | etc.)
 *
 * Docs: https://api.helpdesk.com/docs#tag/Tickets
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Nested assignment object on a HelpDesk ticket */
interface RawHelpdeskAssignment {
  agentID?: string | null
  teamID?: string | null
  [key: string]: unknown
}

/** Nested requester object on a HelpDesk ticket */
interface RawHelpdeskRequester {
  id?: string | null
  /** UUID referencing the contact/agent */
  ID?: string | null
  email?: string | null
  name?: string | null
  [key: string]: unknown
}

/** Nested rating object on a HelpDesk ticket */
interface RawHelpdeskRating {
  value?: string | null
  comment?: string | null
  [key: string]: unknown
}

export interface RawHelpdeskTicket {
  ID?: string | null
  /** Short human-readable ID */
  shortId?: string | null
  licenseID?: number | null
  subject?: string | null
  status?: string | null
  /** Priority: -10 = low, 0 = medium, 10 = high, 20 = urgent */
  priority?: number | null
  source?: string | null
  requester?: RawHelpdeskRequester | null
  assignment?: RawHelpdeskAssignment | null
  /** Direct team ID (may also be inside assignment) */
  teamID?: string | null
  /** Array of tag UUIDs */
  tagIds?: string[] | null
  /** Array of team IDs with access */
  teamIds?: string[] | null
  parentTicket?: { ID?: string | null } | null
  rating?: RawHelpdeskRating | null
  createdAt?: string | null
  updatedAt?: string | null
  lastMessageAt?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'onhold':
      return 'on_hold'
    case 'solved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(p: number | null | undefined): TicketPriority | undefined {
  if (p === -10) return 'low'
  if (p === 0) return 'normal'
  if (p === 10) return 'high'
  if (p === 20) return 'urgent'
  return undefined
}

function mapChannel(source: string | null | undefined): Channel {
  switch (source) {
    case 'email':
      return 'email'
    case 'chat':
    case 'livechat':
    case 'widget':
      return 'chat'
    case 'sms':
      return 'sms'
    case 'api':
      return 'api'
    case 'form':
    case 'web':
      return 'web'
    case 'facebook':
    case 'twitter':
    case 'social':
      return 'social'
    default:
      return 'other'
  }
}

function mapRating(rating: RawHelpdeskRating | null | undefined): number | undefined {
  if (!rating) return undefined
  const v = pickStr(rating.value)
  if (!v) return undefined
  // HelpDesk ratings: "good" = 5, "bad" = 1, or numeric string
  if (v === 'good') return 5
  if (v === 'bad') return 1
  const n = Number(v)
  if (!Number.isNaN(n) && n >= 1 && n <= 5) return Math.round(n)
  return undefined
}

export function transformTicket(raw: RawHelpdeskTicket): Ticket {
  const id = pickStr(raw.ID) ?? pickStr(raw['id']) ?? ''
  const status = mapStatus(raw.status)

  const requesterId =
    pickStr(raw.requester?.ID) ??
    pickStr(raw.requester?.id) ??
    ''

  const assigneeId =
    pickStr(raw.assignment?.agentID) ?? undefined

  const teamId =
    pickStr(raw.assignment?.teamID) ??
    pickStr(raw.teamID) ??
    undefined

  return {
    id,
    externalId: id,
    number: pickStr(raw.shortId) ?? id,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.source),
    requesterId,
    assigneeId,
    teamId,
    tagIds: raw.tagIds ?? [],
    parentTicketId: raw.parentTicket?.ID ? pickStr(raw.parentTicket.ID) : undefined,
    satisfactionRating: mapRating(raw.rating),
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    resolvedAt:
      status === 'resolved' || status === 'closed'
        ? toIso(raw.updatedAt)
        : undefined,
    platform: 'hellotars-support',
    metadata: strMap({
      source: raw.source,
      shortId: raw.shortId,
      licenseID: raw.licenseID,
      lastMessageAt: raw.lastMessageAt,
    }),
    raw,
  }
}
