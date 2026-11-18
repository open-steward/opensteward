/**
 * LiveAgent ticket (TicketInformation) → canonical Ticket.
 *
 * LiveAgent v3 ticket status single-char codes:
 *   C = Opened/Active   R = Resolved   A = Answered
 *   X = Deleted         T = Chat        P = Call
 *
 * channel_type strings observed in the API: E (email), C (chat),
 * P (phone/call), F (facebook), T (twitter), W (contact form/web),
 * A (API), I (internal).
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLiveagentTicket {
  id?: string
  code?: string
  owner_contactid?: string
  agentid?: string | null
  departmentid?: string | null
  status?: string
  tags?: string | string[]
  channel_type?: string
  date_created?: string
  date_changed?: string
  date_resolved?: string | null
  subject?: string
  custom_fields?: Array<{ codename?: string; value?: string }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'C': // opened/active
    case 'T': // chat active
    case 'P': // call active
      return 'open'
    case 'A': // answered (waiting on customer)
      return 'pending'
    case 'R': // resolved
      return 'resolved'
    case 'X': // deleted
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(c: string | undefined): Channel {
  switch (c) {
    case 'E':
      return 'email'
    case 'C':
      return 'chat'
    case 'P':
      return 'voice'
    case 'F':
    case 'T':
      return 'social'
    case 'W':
      return 'web'
    case 'A':
      return 'api'
    default:
      return 'other'
  }
}

function parseTags(raw: RawLiveagentTicket): string[] {
  if (!raw.tags) return []
  if (Array.isArray(raw.tags)) return raw.tags.map(String)
  // API sometimes returns a comma-separated string
  if (typeof raw.tags === 'string' && raw.tags.length > 0) {
    return raw.tags.split(',').map((t) => t.trim()).filter(Boolean)
  }
  return []
}

export function transformTicket(raw: RawLiveagentTicket): Ticket {
  const id = pickStr(raw.id) ?? pickStr(raw.code) ?? ''
  const status = mapStatus(raw.status)
  return {
    id,
    externalId: id,
    number: pickStr(raw.code) ?? id,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: undefined, // LiveAgent v3 does not expose a priority field
    channel: mapChannel(raw.channel_type),
    requesterId: pickStr(raw.owner_contactid) ?? '',
    assigneeId: raw.agentid ? pickStr(raw.agentid) : undefined,
    teamId: raw.departmentid ? pickStr(raw.departmentid) : undefined,
    tagIds: parseTags(raw),
    parentTicketId: undefined, // not a v3 concept
    satisfactionRating: undefined, // not exposed in v3 ticket object
    createdAt: toIso(raw.date_created) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.date_changed),
    resolvedAt: raw.date_resolved ? toIso(raw.date_resolved) : (
      status === 'resolved' || status === 'closed' ? toIso(raw.date_changed) : undefined
    ),
    platform: 'liveagent',
    metadata: strMap({ rawStatus: raw.status, rawChannel: raw.channel_type }),
    raw,
  }
}
