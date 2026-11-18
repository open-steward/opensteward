/**
 * Deskpro ticket transform.
 *
 * Deskpro ticket statuses: awaiting_agent | awaiting_user | resolved |
 * archived (closed) | hidden.
 *
 * The API response envelope wraps tickets in  { data: { ... } }  for single
 * or  { data: [...] }  for collections.
 *
 * Labels are string arrays on  ticket.labels[].label  when sideloaded, or
 * just IDs when not. We surface the label ID strings as tagIds.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Deskpro ticket object as returned by GET /api/v2/tickets/{id}
 * (inside the .data envelope).
 */
export interface RawDeskproTicket {
  id: number
  /** Human-readable ticket reference, e.g. "XXXX-0028-IOCC" */
  ref?: string | null
  subject?: string
  /** awaiting_agent | awaiting_user | resolved | archived | hidden */
  status?: string
  /** Deskpro priority object or id */
  priority?: { id?: number; name?: string } | number | null
  /** Creation channel object or string */
  creation_system?: string | null
  /** Person (requester) id */
  person?: { id?: number } | number | null
  /** Agent id */
  agent?: { id?: number } | number | null
  /** Department id */
  department?: { id?: number; title?: string } | number | null
  /** Labels attached to this ticket */
  labels?: Array<string | { id?: number; label?: string }>
  date_created?: string
  date_updated?: string
  date_resolved?: string | null
  date_archived?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'awaiting_agent':
    case 'live':
      return 'open'
    case 'awaiting_user':
      return 'pending'
    case 'resolved':
      return 'resolved'
    case 'archived':
    case 'hidden':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(raw: RawDeskproTicket): TicketPriority | undefined {
  const p = raw.priority
  if (p == null) return undefined
  // May be an object with a name field or a raw number/string
  const name = typeof p === 'object' ? (p as { name?: string }).name : undefined
  if (name === 'low' || name === '1') return 'low'
  if (name === 'normal' || name === '2') return 'normal'
  if (name === 'high' || name === '3') return 'high'
  if (name === 'urgent' || name === '4') return 'urgent'
  return undefined
}

function mapChannel(system: string | null | undefined): Channel {
  if (!system) return 'other'
  const s = system.toLowerCase()
  if (s.includes('email')) return 'email'
  if (s.includes('chat') || s.includes('widget') || s.includes('web_widget')) return 'chat'
  if (s.includes('api')) return 'api'
  if (s.includes('phone') || s.includes('voice') || s.includes('call')) return 'voice'
  if (s.includes('twitter') || s.includes('facebook') || s.includes('social')) return 'social'
  if (s.includes('sms')) return 'sms'
  if (s.includes('web')) return 'web'
  return 'other'
}

function extractId(field: { id?: number } | number | null | undefined): string | undefined {
  if (field == null) return undefined
  if (typeof field === 'number') return field > 0 ? String(field) : undefined
  const id = (field as { id?: number }).id
  return id != null && id > 0 ? String(id) : undefined
}

function extractLabelIds(labels: RawDeskproTicket['labels']): string[] {
  if (!Array.isArray(labels)) return []
  return labels.flatMap((l) => {
    if (typeof l === 'string') return l ? [l] : []
    const lbl = (l as { id?: number; label?: string }).label ?? String((l as { id?: number }).id ?? '')
    return lbl ? [lbl] : []
  })
}

export function transformTicket(raw: RawDeskproTicket): Ticket {
  const status = mapStatus(raw.status)
  const resolvedAt = raw.date_resolved ? toIso(raw.date_resolved) : (status === 'resolved' ? toIso(raw.date_updated) : undefined)
  const closedAt = raw.date_archived ? toIso(raw.date_archived) : (status === 'closed' ? toIso(raw.date_updated) : undefined)
  return {
    id: String(raw.id),
    externalId: raw.ref ? String(raw.ref) : String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw),
    channel: mapChannel(raw.creation_system),
    requesterId: extractId(raw.person) ?? '',
    assigneeId: extractId(raw.agent),
    teamId: extractId(raw.department),
    tagIds: extractLabelIds(raw.labels),
    resolvedAt,
    closedAt,
    createdAt: toIso(raw.date_created) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.date_updated),
    platform: 'deskpro',
    metadata: strMap({
      ref: raw.ref,
      rawStatus: raw.status,
      creationSystem: raw.creation_system,
    }),
    raw,
  }
}
