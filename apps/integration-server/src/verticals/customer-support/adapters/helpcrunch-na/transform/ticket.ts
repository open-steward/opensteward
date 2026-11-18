/**
 * InvGate Service Management — incident (ticket) transform.
 *
 * Incident API response field reference:
 *   id, pretty_id, title, description,
 *   status_id, priority_id, type_id, source_id, category_id,
 *   user_id (customer), creator_id, assigned_id (agent), assigned_group_id (helpdesk),
 *   created_at, last_update, solved_at, closed_at,
 *   attachments, custom_fields, rating
 *
 * Status IDs: 1=Open 2=Closed 3=Pending 4=On Hold (default; instance-configurable)
 * Priority IDs: 1=Low 2=Normal 3=High 4=Urgent 5=Critical
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import { STATUS_ID_MAP, PRIORITY_ID_MAP } from '../constants'

export interface RawInvGateIncident {
  id: number
  pretty_id?: string | null
  title?: string
  description?: string | null
  status_id?: number | null
  priority_id?: number | null
  type_id?: number | null
  source_id?: number | null
  category_id?: number | null
  user_id?: number | null          // customer
  creator_id?: number | null
  assigned_id?: number | null      // agent
  assigned_group_id?: number | null // helpdesk / group
  created_at?: string | number | null
  last_update?: string | number | null
  solved_at?: string | number | null
  closed_at?: string | number | null
  rating?: number | null
  attachments?: unknown[]
  custom_fields?: unknown
  [key: string]: unknown
}

function mapStatus(statusId: number | null | undefined): TicketStatus {
  if (statusId == null) return 'open'
  const name = STATUS_ID_MAP[statusId]
  switch (name) {
    case 'open': return 'open'
    case 'pending': return 'pending'
    case 'on_hold': return 'on_hold'
    case 'closed': return 'closed'
    case 'resolved': return 'resolved'
    default:
      // status_id 2 = closed in InvGate defaults
      if (statusId === 2) return 'closed'
      return 'open'
  }
}

function mapPriority(priorityId: number | null | undefined): TicketPriority | undefined {
  if (priorityId == null) return undefined
  const name = PRIORITY_ID_MAP[priorityId]
  if (name === 'low') return 'low'
  if (name === 'normal') return 'normal'
  if (name === 'high') return 'high'
  if (name === 'urgent') return 'urgent'
  return undefined
}

export function transformTicket(raw: RawInvGateIncident): Ticket {
  const status = mapStatus(raw.status_id)
  const resolvedAt =
    status === 'resolved' || status === 'closed'
      ? (toIso(raw.solved_at) ?? toIso(raw.closed_at) ?? toIso(raw.last_update))
      : undefined

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: pickStr(raw.pretty_id) ?? String(raw.id),
    subject: pickStr(raw.title) ?? '',
    status,
    priority: mapPriority(raw.priority_id),
    channel: 'other',
    requesterId: raw.user_id != null ? String(raw.user_id) : '',
    assigneeId: raw.assigned_id != null ? String(raw.assigned_id) : undefined,
    teamId: raw.assigned_group_id != null ? String(raw.assigned_group_id) : undefined,
    tagIds: [],
    satisfactionRating: raw.rating != null ? Number(raw.rating) : undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.last_update),
    resolvedAt,
    platform: 'helpcrunch-na',
    metadata: strMap({
      categoryId: raw.category_id,
      typeId: raw.type_id,
      sourceId: raw.source_id,
      creatorId: raw.creator_id,
      statusId: raw.status_id,
      priorityId: raw.priority_id,
    }),
    raw,
  }
}
