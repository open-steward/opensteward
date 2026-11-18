/**
 * Transform a raw HaloPSA ticket (Faults object) to the canonical Ticket shape.
 *
 * HaloPSA wire field reference (confirmed from community wrappers + API doc):
 *   id              — integer ticket ID
 *   ref             — human-readable ticket number (e.g. "INC12345")
 *   summary         — ticket subject/title
 *   details         — full description (HTML or plain text)
 *   status_id       — numeric status code
 *   status          — { id, name } object when includesstatus=true
 *   priority_id     — numeric priority code
 *   priority        — { id, name } object
 *   team_id         — integer team ID
 *   agent_id        — integer assignee agent ID
 *   client_id       — integer customer/client ID (contact)
 *   user_id         — integer end-user ID (requester)
 *   dateoccurred    — ISO-8601 creation timestamp
 *   dateclosed      — ISO-8601 close timestamp (null if open)
 *   lastmodifieddate — ISO-8601 last-updated timestamp
 *   tickettype_id   — numeric ticket type
 *   tags            — array of { id, text } objects
 *   satisfactionrating — integer 1-5 when set
 *   hascustomerreply  — boolean
 *   isopen          — boolean (true when ticket not resolved/closed)
 *   parentticket_id — integer parent ticket ID (for merges/children)
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHaloPsaTicket {
  id: number
  ref?: string | null
  summary?: string | null
  details?: string | null
  /** Numeric status ID or embedded status object */
  status_id?: number
  status?: { id?: number; name?: string } | null
  priority_id?: number
  priority?: { id?: number; name?: string } | null
  team_id?: number | null
  agent_id?: number | null
  client_id?: number | null
  user_id?: number | null
  dateoccurred?: string | null
  dateclosed?: string | null
  lastmodifieddate?: string | null
  tickettype_id?: number | null
  tags?: Array<{ id?: number; text?: string } | string> | null
  satisfactionrating?: number | null
  parentticket_id?: number | null
  isopen?: boolean | null
  [key: string]: unknown
}

/**
 * HaloPSA does not expose canonical status names — map common status IDs.
 * Customers can define custom statuses, so unknown IDs fall back to 'open'.
 * Common built-in IDs (may vary per instance):
 *   1 = New/Open, 2 = In Progress, 3 = Pending Customer,
 *   4 = On Hold, 5 = Resolved, 6 = Closed
 */
function mapStatus(raw: RawHaloPsaTicket): TicketStatus {
  const name = (raw.status?.name ?? '').toLowerCase()
  const id = raw.status_id ?? raw.status?.id ?? 0

  if (name.includes('closed') || id === 6) return 'closed'
  if (name.includes('resolv') || id === 5) return 'resolved'
  if (name.includes('hold') || id === 4) return 'on_hold'
  if (name.includes('pending') || id === 3) return 'pending'
  // isopen=false and none of the above names means closed
  if (raw.isopen === false) return 'closed'
  return 'open'
}

function mapPriority(raw: RawHaloPsaTicket): TicketPriority | undefined {
  const name = (raw.priority?.name ?? '').toLowerCase()
  if (name.includes('urgent') || name.includes('critical') || name.includes('emergency')) return 'urgent'
  if (name.includes('high')) return 'high'
  if (name.includes('medium') || name.includes('normal')) return 'normal'
  if (name.includes('low')) return 'low'
  return undefined
}

function extractTagIds(raw: RawHaloPsaTicket): string[] {
  if (!raw.tags || !Array.isArray(raw.tags)) return []
  return raw.tags.map((t) => {
    if (typeof t === 'string') return t
    if (typeof t === 'object' && t !== null) return String((t as { id?: unknown; text?: unknown }).id ?? (t as { text?: unknown }).text ?? '')
    return String(t)
  }).filter(Boolean)
}

export function transformTicket(raw: RawHaloPsaTicket): Ticket {
  const status = mapStatus(raw)
  const resolvedAt = status === 'resolved' || status === 'closed'
    ? toIso(raw.dateclosed) ?? toIso(raw.lastmodifieddate)
    : undefined
  return {
    id: String(raw.id),
    externalId: raw.ref ? String(raw.ref) : String(raw.id),
    number: raw.ref ? String(raw.ref) : String(raw.id),
    subject: pickStr(raw.summary) ?? '',
    status,
    priority: mapPriority(raw),
    channel: 'other',
    requesterId: raw.user_id != null ? String(raw.user_id) : (raw.client_id != null ? String(raw.client_id) : ''),
    assigneeId: raw.agent_id != null ? String(raw.agent_id) : undefined,
    teamId: raw.team_id != null ? String(raw.team_id) : undefined,
    tagIds: extractTagIds(raw),
    parentTicketId: raw.parentticket_id != null ? String(raw.parentticket_id) : undefined,
    satisfactionRating: typeof raw.satisfactionrating === 'number' && raw.satisfactionrating >= 1 && raw.satisfactionrating <= 5
      ? raw.satisfactionrating
      : undefined,
    createdAt: toIso(raw.dateoccurred) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.lastmodifieddate),
    resolvedAt,
    closedAt: status === 'closed' ? toIso(raw.dateclosed) ?? toIso(raw.lastmodifieddate) : undefined,
    platform: 'halopsa',
    metadata: strMap({
      status_id: raw.status_id,
      status_name: raw.status?.name,
      priority_id: raw.priority_id,
      priority_name: raw.priority?.name,
      tickettype_id: raw.tickettype_id,
      client_id: raw.client_id,
    }),
    raw,
  }
}
