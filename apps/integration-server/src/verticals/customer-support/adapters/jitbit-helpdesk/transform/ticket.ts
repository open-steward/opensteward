/**
 * Transform a raw Jitbit Helpdesk ticket to the canonical Ticket schema.
 *
 * GET /Tickets returns list items; GET /ticket?id={id} returns a single item
 * with extra fields (ResolvedDate, Tags, etc.). Both shapes are handled here.
 *
 * Jitbit status IDs: 1=New, 2=In process, 3=Closed (plus arbitrary custom IDs).
 * Jitbit priority:   -1=Low, 0=Normal, 1=High, 2=Critical.
 * Jitbit origin:     1=Email, 2=Web, 3=API, 4=Chat (documented as 'Origin' field).
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Shape returned by GET /Tickets (list) and partially by GET /ticket?id= */
export interface RawJitbitTicket {
  IssueID?: number
  /** Text status label e.g. "New", "In process", "Closed" */
  Status?: string
  /** Numeric status ID: 1=New, 2=In process, 3=Closed, or custom */
  StatusID?: number
  Subject?: string
  /** Priority: -1=Low, 0=Normal, 1=High, 2=Critical */
  Priority?: number
  /** Origin/channel numeric: 1=Email, 2=Web, 3=API, 4=Chat */
  Origin?: number
  UserID?: number
  /** Submitter username */
  UserName?: string
  AssignedToUserID?: number | null
  /** Assignee display name */
  Technician?: string
  CategoryID?: number | null
  /** Category name */
  Category?: string
  CompanyID?: number | null
  /** API returns array of {TagID, Name, TagCount} objects; legacy/fallback may be a comma-separated string */
  Tags?: Array<{TagID?: number; Name?: string}> | string | null
  /** ISO datetime the issue was created */
  IssueDate?: string
  /** ISO datetime of last update */
  LastUpdated?: string
  /** ISO datetime when resolved (only on single-ticket response) */
  ResolvedDate?: string | null
  DueDate?: string | null
  HasChildren?: boolean
  [key: string]: unknown
}

function mapStatus(raw: RawJitbitTicket): TicketStatus {
  // Prefer text label if present; fall back to numeric StatusID
  const label = (raw.Status ?? '').toLowerCase()
  if (label === 'new') return 'open'
  if (label === 'in process' || label === 'in-process') return 'pending'
  if (label === 'closed') return 'closed'
  // Numeric fallback
  switch (raw.StatusID) {
    case 1: return 'open'
    case 2: return 'pending'
    case 3: return 'closed'
  }
  return 'open'
}

function mapPriority(p: number | undefined): TicketPriority | undefined {
  if (p === undefined || p === null) return undefined
  if (p === -1) return 'low'
  if (p === 0) return 'normal'
  if (p === 1) return 'high'
  if (p === 2) return 'urgent'
  return undefined
}

function mapChannel(origin: number | undefined): Channel {
  switch (origin) {
    case 1: return 'email'
    case 2: return 'web'
    case 3: return 'api'
    case 4: return 'chat'
    default: return 'other'
  }
}

function parseTags(tags: Array<{TagID?: number; Name?: string}> | string | null | undefined): string[] {
  if (!tags) return []
  // API returns array of {TagID, Name, TagCount} objects
  if (Array.isArray(tags)) {
    return tags
      .map((t) => (typeof t.Name === 'string' ? t.Name.trim() : ''))
      .filter(Boolean)
  }
  // Fallback: legacy comma-separated string (guard for non-string input)
  if (typeof tags !== 'string') return []
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function transformTicket(raw: RawJitbitTicket): Ticket {
  const status = mapStatus(raw)
  const id = String(raw.IssueID ?? '')
  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.Subject) ?? '',
    status,
    priority: mapPriority(raw.Priority),
    channel: mapChannel(raw.Origin),
    requesterId: raw.UserID != null ? String(raw.UserID) : '',
    assigneeId: raw.AssignedToUserID != null ? String(raw.AssignedToUserID) : undefined,
    teamId: undefined,  // Jitbit uses Categories, not groups/teams
    tagIds: parseTags(raw.Tags),
    parentTicketId: undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.IssueDate) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.LastUpdated),
    resolvedAt:
      (status === 'resolved' || status === 'closed')
        ? (toIso(raw.ResolvedDate) ?? toIso(raw.LastUpdated))
        : undefined,
    platform: 'jitbit-helpdesk',
    metadata: strMap({
      statusLabel: raw.Status,
      categoryId: raw.CategoryID,
      categoryName: raw.Category,
      companyId: raw.CompanyID,
      submitterName: raw.UserName,
      assigneeName: raw.Technician,
      hasChildren: raw.HasChildren,
      dueDate: raw.DueDate,
      originRaw: raw.Origin,
    }),
    raw,
  }
}
