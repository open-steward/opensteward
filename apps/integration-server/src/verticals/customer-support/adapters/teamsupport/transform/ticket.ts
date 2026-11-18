/**
 * TeamSupport ticket transform.
 *
 * TeamSupport ticket JSON fields (PascalCase, from the Ruby gem + API docs):
 *   ID, TicketNumber, Name (subject), Status, Severity (priority),
 *   TicketSource (channel), OrganizationID (customer/requester),
 *   UserID (assignee), GroupID (team), ParentID, DateCreated, DateModified,
 *   DateClosed, IsClosed, IsVisibleOnPortal.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTeamsupportTicket {
  ID?: number | string
  TicketNumber?: number | string
  Name?: string
  Status?: string
  Severity?: string | null
  TicketSource?: string | null
  OrganizationID?: number | string | null
  UserID?: number | string | null
  GroupID?: number | string | null
  ParentID?: number | string | null
  DateCreated?: string | null
  DateModified?: string | null
  DateClosed?: string | null
  IsClosed?: boolean | string
  IsVisibleOnPortal?: boolean | string
  [key: string]: unknown
}

function mapStatus(raw: RawTeamsupportTicket): TicketStatus {
  // TeamSupport uses a Status string and IsClosed flag.
  // IsClosed=true (or Status="Closed") → canonical 'closed'.
  // Status="Resolved" without IsClosed → canonical 'resolved' (distinct from 'closed').
  const s = typeof raw.Status === 'string' ? raw.Status.toLowerCase() : ''
  const closed = raw.IsClosed === true || raw.IsClosed === 'true' || raw.IsClosed === 'True'
  if (closed || s === 'closed') return 'closed'
  if (s === 'resolved') return 'resolved'
  if (s === 'open' || s === 'new') return 'open'
  if (s === 'pending') return 'pending'
  if (s === 'in progress' || s === 'in_progress') return 'in_progress'
  if (s === 'on hold' || s === 'on_hold' || s === 'hold') return 'on_hold'
  return 'open'
}

function mapPriority(s: string | null | undefined): TicketPriority | undefined {
  if (!s) return undefined
  const lower = s.toLowerCase()
  if (lower === 'low') return 'low'
  if (lower === 'normal' || lower === 'medium') return 'normal'
  if (lower === 'high') return 'high'
  if (lower === 'urgent' || lower === 'critical') return 'urgent'
  return undefined
}

function mapChannel(s: string | null | undefined): Channel {
  if (!s) return 'other'
  const lower = s.toLowerCase()
  if (lower === 'email') return 'email'
  if (lower === 'chat' || lower === 'live chat') return 'chat'
  if (lower === 'phone' || lower === 'voice') return 'voice'
  if (lower === 'twitter' || lower === 'facebook' || lower === 'social') return 'social'
  if (lower === 'web' || lower === 'portal') return 'web'
  if (lower === 'sms') return 'sms'
  if (lower === 'api') return 'api'
  return 'other'
}

export function transformTicket(raw: RawTeamsupportTicket): Ticket {
  const status = mapStatus(raw)
  const closedAt = toIso(raw.DateClosed)
  return {
    id: String(raw.ID ?? ''),
    externalId: String(raw.ID ?? ''),
    number: raw.TicketNumber != null ? String(raw.TicketNumber) : undefined,
    subject: pickStr(raw.Name) ?? '',
    status,
    priority: mapPriority(raw.Severity),
    channel: mapChannel(raw.TicketSource),
    requesterId: raw.OrganizationID != null ? String(raw.OrganizationID) : '',
    assigneeId: raw.UserID != null ? String(raw.UserID) : undefined,
    teamId: raw.GroupID != null ? String(raw.GroupID) : undefined,
    tagIds: [],
    parentTicketId: raw.ParentID != null ? String(raw.ParentID) : undefined,
    createdAt: toIso(raw.DateCreated) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.DateModified),
    resolvedAt: status === 'resolved' || status === 'closed' ? (closedAt ?? toIso(raw.DateModified)) : undefined,
    closedAt,
    platform: 'teamsupport',
    metadata: strMap({ TicketSource: raw.TicketSource, Status: raw.Status }),
    raw,
  }
}
