/**
 * Movidesk (Zenvia Service) ticket transform.
 *
 * Ticket object returned by GET /public/v1/tickets (with $expand=clients,owner,actions).
 *
 * Status string values (from Movidesk UI):
 *   "New" | "In attendance" | "Stopped" | "Resolved" | "Closed" | "Cancelled"
 *
 * Urgency string values:
 *   "Low" | "Normal" | "High" | "Urgent"
 *
 * Origin (int) → channel:
 *   1=Email, 2=Phone, 4=Chat, 5=Facebook, 6=Twitter, 7=Web, 8=Integrated API,
 *   9=Manual, 10=WhatsApp
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Minimal person object embedded in ticket owner / clients fields. */
export interface RawMovideskPerson {
  id?: string | null
  businessName?: string | null
  email?: string | null
  phone?: string | null
  personType?: number | null
  profileType?: number | null
  [key: string]: unknown
}

/** `ticket.actions[n]`, as the ticket reference documents it. */
export interface RawMovideskAction {
  id?: number | null
  type?: number | null
  origin?: number | null
  description?: string | null
  status?: string | null
  justification?: string | null
  createdDate?: string | null
  createdBy?: RawMovideskPerson | null
  isDeleted?: boolean | null
  attachments?: Array<{
    fileName?: string | null
    path?: string | null
    createdBy?: RawMovideskPerson | null
    createdDate?: string | null
  }> | null
  [key: string]: unknown
}

export interface RawMovideskTicket {
  id?: number | null
  protocol?: string | null
  type?: number | null
  subject?: string | null
  category?: string | null
  urgency?: string | null
  status?: string | null
  baseStatus?: string | null
  origin?: number | null
  createdDate?: string | null
  lastUpdate?: string | null
  resolvedIn?: string | null
  closedIn?: string | null
  owner?: RawMovideskPerson | null
  ownerTeam?: string | null
  createdBy?: RawMovideskPerson | null
  clients?: RawMovideskPerson[] | null
  actions?: RawMovideskAction[] | null
  serviceFirstLevel?: string | null
  serviceSecondLevel?: string | null
  serviceThirdLevel?: string | null
  slaSolutionDate?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  const v = (s ?? '').toLowerCase()
  if (v === 'new') return 'open'
  if (v === 'in attendance') return 'in_progress'
  if (v === 'stopped') return 'on_hold'
  if (v === 'resolved') return 'resolved'
  if (v === 'closed' || v === 'cancelled') return 'closed'
  return 'open'
}

function mapPriority(u: string | null | undefined): TicketPriority | undefined {
  const v = (u ?? '').toLowerCase()
  if (v === 'low') return 'low'
  if (v === 'normal') return 'normal'
  if (v === 'high') return 'high'
  if (v === 'urgent') return 'urgent'
  return undefined
}

function mapOrigin(origin: number | null | undefined): Channel {
  switch (origin) {
    case 1:
      return 'email'
    case 2:
      return 'voice'
    case 4:
      return 'chat'
    case 5:
      return 'social' // Facebook
    case 6:
      return 'social' // Twitter
    case 7:
      return 'web'
    case 8:
      return 'api'
    case 10:
      return 'chat' // WhatsApp
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawMovideskTicket): Ticket {
  const status = mapStatus(raw.status ?? raw.baseStatus)
  const requesterId = pickStr(raw.clients?.[0]?.id ?? raw.createdBy?.id) ?? ''
  const assigneeId = raw.owner?.id ? pickStr(raw.owner.id) : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: pickStr(raw.protocol) ?? String(raw.id ?? ''),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.urgency),
    channel: mapOrigin(raw.origin),
    requesterId,
    assigneeId,
    teamId: pickStr(raw.ownerTeam),
    tagIds: [],
    parentTicketId: undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.createdDate) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.lastUpdate),
    resolvedAt: toIso(raw.resolvedIn),
    closedAt: toIso(raw.closedIn),
    platform: 'movidesk',
    metadata: strMap({
      category: raw.category,
      serviceFirstLevel: raw.serviceFirstLevel,
      serviceSecondLevel: raw.serviceSecondLevel,
      serviceThirdLevel: raw.serviceThirdLevel,
      ownerTeam: raw.ownerTeam,
      rawOrigin: raw.origin,
      rawStatus: raw.status,
      rawUrgency: raw.urgency,
    }),
    raw,
  }
}
