/**
 * Transform an eGain Case (ticket) from the Interaction REST API into the
 * canonical OpenSteward Ticket schema.
 *
 * eGain Case endpoint: GET /ws/v12/interaction/case
 * Response shape documented at:
 *   https://hd.egain.com/api/authoring_interaction_api_reference/html/d6/d7e/class_search_cases_examples.html
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw eGain case object as returned by GET /ws/v12/interaction/case.
 *
 * Fields marked optional are only present with $attribute=all or when
 * explicitly requested. The `status` and `customer` objects are always
 * included in summary responses.
 */
export interface RawEgainCase {
  id: number | string
  subject?: string
  status?: {
    value?: string
    displayValue?: string
  }
  customer?: {
    id?: number | string
    customerName?: string
    link?: unknown
  }
  /** ISO-8601 date of case creation. Present when $attribute includes `created`. */
  created?: {
    date?: string
    user?: unknown
  }
  /** ISO-8601 date of last activity on the case. */
  recentActivityDate?: string
  /** Last modification timestamp. Present when $attribute includes `lastModified`. */
  lastModified?: {
    date?: string
    user?: unknown
  }
  /** Assignee / user working on the case. Present with $attribute. */
  assignedTo?: {
    id?: number | string
    name?: string
  }
  /** Department / queue the case belongs to. */
  department?: {
    id?: number | string
    name?: string
  }
  /** Link to activities for this case. */
  activities?: unknown
  /** Arbitrary additional attributes requested via $attribute=. */
  customAttributes?: unknown
  [key: string]: unknown
}

/**
 * Map an eGain case status value to the canonical TicketStatus.
 *
 * eGain statuses: open, closed, (custom values possible)
 */
function mapStatus(s: string | undefined): TicketStatus {
  const lower = (s ?? '').toLowerCase()
  switch (lower) {
    case 'open':
      return 'open'
    case 'closed':
      return 'closed'
    case 'pending':
      return 'pending'
    case 'on_hold':
    case 'on hold':
      return 'on_hold'
    case 'resolved':
    case 'solved':
      return 'resolved'
    default:
      return 'open'
  }
}

/**
 * eGain does not expose a rich channel type on cases.
 * We default to 'other' and let metadata carry the raw type if available.
 */
function mapChannel(): Channel {
  return 'other'
}

export function transformTicket(raw: RawEgainCase): Ticket {
  const status = mapStatus(raw.status?.value)
  const createdDate =
    toIso(raw.created?.date) ??
    toIso(raw.recentActivityDate) ??
    new Date(0).toISOString()
  const updatedDate =
    toIso(raw.lastModified?.date) ?? toIso(raw.recentActivityDate)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    channel: mapChannel(),
    requesterId: raw.customer?.id ? String(raw.customer.id) : '',
    assigneeId: raw.assignedTo?.id ? String(raw.assignedTo.id) : undefined,
    teamId: raw.department?.id ? String(raw.department.id) : undefined,
    tagIds: [],
    createdAt: createdDate,
    updatedAt: updatedDate,
    resolvedAt: status === 'resolved' || status === 'closed' ? updatedDate : undefined,
    platform: 'egain',
    metadata: strMap({
      statusDisplayValue: raw.status?.displayValue,
      customerName: raw.customer?.customerName,
      departmentName: raw.department?.name,
      assigneeName: raw.assignedTo?.name,
    }),
    raw,
  }
}
