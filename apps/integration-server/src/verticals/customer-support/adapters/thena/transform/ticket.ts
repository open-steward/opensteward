import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw ticket shape returned by GET /v1/tickets (TicketResponseDto).
 * Fields sourced from Thena Platform API docs.
 */
export interface RawThenaTicket {
  id: string
  ticketIdentifier?: string
  ticketId?: number
  title?: string
  description?: string
  source?: string
  accountId?: string
  status?: string
  statusId?: string
  priority?: string
  priorityId?: string
  teamId?: string
  teamName?: string
  teamIdentifier?: string
  assignedAgentId?: string
  assignedAgentEmail?: string
  requestorEmail?: string
  customerContactId?: string
  customerContactFirstName?: string
  customerContactLastName?: string
  customerContactEmail?: string
  createdAt?: string
  updatedAt?: string
  closedAt?: string | null
  closedById?: string | null
  deletedAt?: string
  archivedAt?: string
  isEscalated?: boolean
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  if (!s) return 'open'
  const lower = s.toLowerCase()
  if (lower === 'open' || lower === 'new') return 'open'
  if (lower === 'in_progress' || lower === 'inprogress' || lower === 'in progress') return 'in_progress'
  if (lower === 'pending' || lower === 'waiting') return 'pending'
  if (lower === 'on_hold' || lower === 'hold' || lower === 'paused') return 'on_hold'
  if (lower === 'resolved' || lower === 'solved') return 'resolved'
  if (lower === 'closed') return 'closed'
  return 'open'
}

function mapPriority(p: string | undefined): TicketPriority | undefined {
  if (!p) return undefined
  const lower = p.toLowerCase()
  if (lower === 'low') return 'low'
  if (lower === 'normal' || lower === 'medium') return 'normal'
  if (lower === 'high') return 'high'
  if (lower === 'urgent' || lower === 'critical') return 'urgent'
  return undefined
}

function mapChannel(source: string | undefined): Channel {
  if (!source) return 'other'
  const lower = source.toLowerCase()
  if (lower === 'email') return 'email'
  if (lower === 'slack' || lower === 'chat' || lower === 'teams') return 'chat'
  if (lower === 'api') return 'api'
  if (lower === 'web' || lower === 'portal') return 'web'
  if (lower === 'sms') return 'sms'
  return 'other'
}

export function transformTicket(raw: RawThenaTicket): Ticket {
  const status = mapStatus(raw.status)
  const contactName = [raw.customerContactFirstName, raw.customerContactLastName]
    .filter(Boolean)
    .join(' ')
  return {
    id: pickStr(raw.id) ?? String(raw.ticketId ?? ''),
    externalId: pickStr(raw.ticketIdentifier) ?? pickStr(raw.id) ?? '',
    number: raw.ticketId ? String(raw.ticketId) : undefined,
    subject: pickStr(raw.title) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.source),
    requesterId: pickStr(raw.customerContactId) ?? pickStr(raw.requestorEmail) ?? '',
    assigneeId: pickStr(raw.assignedAgentId),
    teamId: pickStr(raw.teamId),
    tagIds: [],
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    resolvedAt: status === 'resolved' ? toIso(raw.updatedAt) : undefined,
    closedAt: toIso(raw.closedAt),
    platform: 'thena',
    metadata: strMap({
      source: raw.source,
      teamName: raw.teamName,
      teamIdentifier: raw.teamIdentifier,
      assignedAgentEmail: raw.assignedAgentEmail,
      requestorEmail: raw.requestorEmail,
      contactName,
      isEscalated: raw.isEscalated,
    }),
    raw,
  }
}
