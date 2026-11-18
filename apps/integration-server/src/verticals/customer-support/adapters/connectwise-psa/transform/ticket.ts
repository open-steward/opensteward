/**
 * ConnectWise PSA service ticket transform.
 *
 * Source endpoint: GET /service/tickets, GET /service/tickets/{id}
 *
 * Key fields used from the API response:
 *   id, summary, status.name, priority.name, board.name, contact.id,
 *   owner.id, team/serviceTeam associations, recordType,
 *   dateEntered (_info.dateEntered), _info.lastUpdated, closedFlag, closedDate
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawCwTicket {
  id: number
  summary?: string
  /** Nested status object — e.g. { id: 1, name: "New" } */
  status?: { id?: number; name?: string }
  /** Nested priority object — e.g. { id: 2, name: "Medium", sort: 2 } */
  priority?: { id?: number; name?: string; sort?: number } | null
  /** Service board the ticket belongs to */
  board?: { id?: number; name?: string }
  /** Contact (end-user who reported the ticket) */
  contact?: { id?: number; name?: string } | null
  /** Assigned member (agent/owner) */
  owner?: { id?: number; identifier?: string; name?: string } | null
  /** Assigned team */
  team?: { id?: number; name?: string } | null
  /** Record type: ServiceTicket | ProjectTicket */
  recordType?: string
  /** Whether ticket is closed */
  closedFlag?: boolean
  /** ISO date the ticket was closed */
  closedDate?: string | null
  _info?: {
    lastUpdated?: string
    dateEntered?: string
    updatedBy?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapStatus(raw: RawCwTicket): TicketStatus {
  if (raw.closedFlag === true) return 'closed'
  const name = (raw.status?.name ?? '').toLowerCase()
  if (name.includes('new') || name.includes('open')) return 'open'
  if (name.includes('in progress') || name.includes('inprogress') || name.includes('working')) return 'in_progress'
  if (name.includes('pending') || name.includes('waiting') || name.includes('hold')) return 'pending'
  if (name.includes('resolved') || name.includes('complete') || name.includes('done')) return 'resolved'
  if (name.includes('closed')) return 'closed'
  return 'open'
}

function mapPriority(raw: RawCwTicket): TicketPriority | undefined {
  const sort = raw.priority?.sort
  const name = (raw.priority?.name ?? '').toLowerCase()
  // ConnectWise priority sort: lower numbers = higher priority (1=Critical, 2=High, 3=Medium, 4=Low, etc.)
  if (name.includes('critical') || name.includes('emergency') || sort === 1) return 'urgent'
  if (name.includes('high') || sort === 2) return 'high'
  if (name.includes('medium') || name.includes('normal') || sort === 3) return 'normal'
  if (name.includes('low') || (sort !== undefined && sort >= 4)) return 'low'
  return undefined
}

export function transformTicket(raw: RawCwTicket): Ticket {
  const status = mapStatus(raw)
  const resolvedAt =
    status === 'resolved' || status === 'closed'
      ? toIso(raw.closedDate) ?? toIso(raw._info?.lastUpdated)
      : undefined

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.summary) ?? '',
    status,
    priority: mapPriority(raw),
    // ConnectWise doesn't expose a channel field; default to 'other'
    channel: 'other',
    requesterId: raw.contact?.id ? String(raw.contact.id) : '',
    assigneeId: raw.owner?.id ? String(raw.owner.id) : undefined,
    teamId: raw.team?.id ? String(raw.team.id) : undefined,
    // ConnectWise tags are not a native concept on tickets; use empty array
    tagIds: [],
    createdAt: toIso(raw._info?.dateEntered) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw._info?.lastUpdated),
    resolvedAt,
    closedAt: raw.closedFlag ? toIso(raw.closedDate) ?? toIso(raw._info?.lastUpdated) : undefined,
    platform: 'connectwise-psa',
    metadata: strMap({
      boardName: raw.board?.name,
      boardId: raw.board?.id,
      statusName: raw.status?.name,
      priorityName: raw.priority?.name,
      recordType: raw.recordType,
      updatedBy: raw._info?.updatedBy,
    }),
    raw,
  }
}
