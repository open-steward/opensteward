/**
 * Transform a raw tawk.to ticket (from /ticket.list) into the canonical Ticket schema.
 *
 * tawk.to ticket fields (from community-confirmed API usage):
 *   _id / id       — ticket identifier (string or ObjectId)
 *   humanId        — short human-readable ticket number
 *   subject        — ticket subject
 *   message        — initial message body
 *   status         — "open" | "resolved" | "closed" | "pending"
 *   requester      — { name, email, type }
 *   assignedTo     — agent object or null
 *   propertyId     — workspace/property id
 *   createdAt      — ISO-8601 creation timestamp
 *   updatedAt      — ISO-8601 last-updated timestamp
 */
import type { Ticket, TicketStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTawkToTicket {
  _id?: string
  id?: string | number
  humanId?: string | number
  subject?: string
  message?: string
  status?: string
  requester?: { name?: string; email?: string; type?: string }
  assignedTo?: { _id?: string; id?: string | number } | null
  propertyId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'resolved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

export function transformTicket(raw: RawTawkToTicket): Ticket {
  const id = pickStr(raw._id) ?? pickStr(raw.id) ?? ''
  const status = mapStatus(raw.status)
  const humanId = pickStr(raw.humanId)

  const assigneeId = raw.assignedTo
    ? pickStr((raw.assignedTo as Record<string, unknown>)['_id']) ??
      pickStr((raw.assignedTo as Record<string, unknown>)['id'])
    : undefined

  return {
    id,
    externalId: id,
    number: humanId ?? id,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: undefined,
    channel: 'other',
    requesterId: pickStr(raw.requester?.email) ?? '',
    assigneeId,
    teamId: undefined,
    tagIds: [],
    parentTicketId: undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    resolvedAt:
      status === 'resolved' || status === 'closed'
        ? (toIso(raw.updatedAt) ?? toIso(raw.createdAt) ?? new Date(0).toISOString())
        : undefined,
    platform: 'tawk-to',
    metadata: strMap({
      propertyId: raw.propertyId,
      requesterEmail: raw.requester?.email,
      requesterType: raw.requester?.type,
    }),
    raw,
  }
}
