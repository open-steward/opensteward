/**
 * Transform an HD Ticket (Frappe Helpdesk) into the canonical Ticket schema.
 *
 * Key HD Ticket fields:
 *   name          — document ID (e.g. "HD-TICKET-00001")
 *   subject       — ticket subject
 *   status        — link to HD Ticket Status (e.g. "Open", "Replied", "Resolved", "Closed")
 *   priority      — link to HD Ticket Priority (e.g. "Low", "Medium", "High", "Urgent")
 *   raised_by     — email of the requester
 *   contact       — link to Contact (requester's contact record)
 *   agent_group   — link to HD Team (assigned team)
 *   _assign       — JSON array of assigned agent emails (standard Frappe field)
 *   creation      — ISO datetime
 *   modified      — ISO datetime
 *   resolution_date — datetime when resolved
 *   feedback_rating — 0–5 numeric rating
 *   via_customer_portal — boolean
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFrappeTicket {
  name: string
  subject?: string
  status?: string
  priority?: string | null
  raised_by?: string
  contact?: string | null
  agent_group?: string | null
  _assign?: string | null          // JSON array of assigned user emails
  creation?: string
  modified?: string
  resolution_date?: string | null
  feedback_rating?: number | null
  via_customer_portal?: number | boolean
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  if (!s) return 'open'
  const lower = s.toLowerCase()
  if (lower === 'open')     return 'open'
  if (lower === 'replied')  return 'pending'
  if (lower === 'on hold')  return 'on_hold'
  if (lower === 'resolved') return 'resolved'
  if (lower === 'closed')   return 'closed'
  // Custom statuses that may exist in self-hosted instances
  return 'open'
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (!p) return undefined
  const lower = p.toLowerCase()
  if (lower === 'low')    return 'low'
  if (lower === 'medium') return 'normal'
  if (lower === 'high')   return 'high'
  if (lower === 'urgent') return 'urgent'
  return undefined
}

function mapChannel(raw: RawFrappeTicket): Channel {
  if (raw.via_customer_portal) return 'web'
  return 'other'
}

/** Extract assignee ID from Frappe's _assign JSON-array field */
function extractAssigneeId(raw: RawFrappeTicket): string | undefined {
  try {
    const str = pickStr(raw._assign)
    if (!str) return undefined
    const arr = JSON.parse(str) as unknown[]
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0])
    return undefined
  } catch {
    return undefined
  }
}

export function transformTicket(raw: RawFrappeTicket): Ticket {
  const status = mapStatus(raw.status)
  const resolvedAt =
    status === 'resolved' || status === 'closed'
      ? toIso(raw.resolution_date) ?? toIso(raw.modified)
      : undefined

  return {
    id: raw.name,
    externalId: raw.name,
    number: raw.name,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw),
    requesterId: pickStr(raw.raised_by) ?? pickStr(raw.contact) ?? '',
    assigneeId: extractAssigneeId(raw),
    teamId: pickStr(raw.agent_group) ?? undefined,
    tagIds: [],
    satisfactionRating: typeof raw.feedback_rating === 'number' && raw.feedback_rating > 0
      ? Math.round(raw.feedback_rating)
      : undefined,
    createdAt: toIso(raw.creation) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.modified),
    resolvedAt,
    platform: 'frappe-helpdesk',
    metadata: strMap({
      frappeStatus: raw.status,
      frappePriority: raw.priority,
      viaCustomerPortal: raw.via_customer_portal,
    }),
    raw,
  }
}
