/**
 * Desk365 ticket transform.
 *
 * Wire field names from the Desk365 REST API v3 (PascalCase in responses):
 *   TicketNumber, ContactEmail, Subject, Status, Priority, Source,
 *   Agent, Group, Category, Subcategory, CreatedOn, UpdatedOn,
 *   ResolvedOn, ClosedOn, DescriptionText, Description
 *
 * Priority numeric values: 1=Low, 5=Medium, 10=High, 20=Urgent
 * Source numeric values: 1=Email, 5=Teams, 6=Portal, 7=Phone, 12=Form, 13=Widget, 15=API
 *
 * Dates come as "yyyy-mm-dd hh:mm:ss" (local server time — treated as UTC).
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawDesk365Ticket {
  TicketNumber?: number | string
  ContactEmail?: string | null
  ContactName?: string | null
  Subject?: string | null
  Status?: string | null
  Priority?: number | string | null
  Source?: number | string | null
  Agent?: string | null
  Group?: string | null
  Category?: string | null
  Subcategory?: string | null
  CreatedOn?: string | null
  UpdatedOn?: string | null
  ResolvedOn?: string | null
  ClosedOn?: string | null
  Description?: string | null
  DescriptionText?: string | null
  SurveyRating?: number | string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  const lower = (s ?? '').toLowerCase()
  switch (lower) {
    case 'open':
    case 'new':
      return 'open'
    case 'pending':
      return 'pending'
    case 'in progress':
    case 'in_progress':
      return 'in_progress'
    case 'on hold':
    case 'on_hold':
      return 'on_hold'
    case 'resolved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(p: number | string | null | undefined): TicketPriority | undefined {
  const n = typeof p === 'string' ? Number(p) : p
  if (n === 1) return 'low'
  if (n === 5) return 'normal'
  if (n === 10) return 'high'
  if (n === 20) return 'urgent'
  // Fallback: try string match
  if (typeof p === 'string') {
    const lower = p.toLowerCase()
    if (lower === 'low') return 'low'
    if (lower === 'medium' || lower === 'normal') return 'normal'
    if (lower === 'high') return 'high'
    if (lower === 'urgent') return 'urgent'
  }
  return undefined
}

function mapSource(s: number | string | null | undefined): Channel {
  const n = typeof s === 'string' ? Number(s) : s
  switch (n) {
    case 1:
      return 'email'
    case 5:
      return 'chat'   // Microsoft Teams
    case 6:
      return 'web'    // Portal
    case 7:
      return 'voice'  // Phone
    case 12:
    case 13:
      return 'web'    // Form / Widget
    case 15:
      return 'api'
    default:
      break
  }
  // Fallback: string match
  if (typeof s === 'string') {
    const lower = s.toLowerCase()
    if (lower === 'email') return 'email'
    if (lower === 'phone') return 'voice'
    if (lower === 'api') return 'api'
    if (lower === 'chat' || lower === 'teams') return 'chat'
    if (lower === 'portal' || lower === 'form' || lower === 'widget') return 'web'
  }
  return 'other'
}

function mapRating(raw: RawDesk365Ticket): number | undefined {
  const r = raw.SurveyRating
  if (r == null) return undefined
  const n = typeof r === 'number' ? r : Number(r)
  if (Number.isNaN(n)) return undefined
  // Desk365 survey types: Satisfaction (1-5), Five Star (1-5), NPS (0-10 → normalise to 1-5)
  if (n >= 1 && n <= 5) return Math.round(n)
  if (n >= 0 && n <= 10) return Math.round(1 + (n / 10) * 4) // NPS → 1-5
  return undefined
}

/**
 * Desk365 date strings come as "yyyy-mm-dd hh:mm:ss". Appending " UTC" makes
 * them parseable as UTC by the JS Date constructor.
 */
function parseDesk365Date(s: string | null | undefined): string | undefined {
  if (!s) return undefined
  // If already ISO-8601 / contains T, let toIso handle it
  if (s.includes('T') || s.includes('+') || s.endsWith('Z')) return toIso(s)
  return toIso(s.trim() + ' UTC')
}

export function transformTicket(raw: RawDesk365Ticket): Ticket {
  const status = mapStatus(raw.Status)
  const resolvedAt = parseDesk365Date(raw.ResolvedOn)
  const closedAt = parseDesk365Date(raw.ClosedOn)

  return {
    id: String(raw.TicketNumber ?? ''),
    externalId: String(raw.TicketNumber ?? ''),
    number: String(raw.TicketNumber ?? ''),
    subject: pickStr(raw.Subject) ?? '',
    status,
    priority: mapPriority(raw.Priority),
    channel: mapSource(raw.Source),
    // Desk365 identifies requesters by email; use email as the requesterId
    requesterId: pickStr(raw.ContactEmail) ?? '',
    // Agent is an email string; store as assigneeId
    assigneeId: pickStr(raw.Agent) ?? undefined,
    // Group is a name string; store as teamId
    teamId: pickStr(raw.Group) ?? undefined,
    tagIds: [],
    satisfactionRating: mapRating(raw),
    createdAt: parseDesk365Date(raw.CreatedOn) ?? new Date(0).toISOString(),
    updatedAt: parseDesk365Date(raw.UpdatedOn),
    resolvedAt: resolvedAt ?? (status === 'resolved' ? parseDesk365Date(raw.UpdatedOn) : undefined),
    closedAt: closedAt ?? (status === 'closed' ? parseDesk365Date(raw.UpdatedOn) : undefined),
    platform: 'deskcom-desk365',
    metadata: strMap({
      contactName: raw.ContactName,
      category: raw.Category,
      subcategory: raw.Subcategory,
    }),
    raw,
  }
}
