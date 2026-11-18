/**
 * Transform a raw ProProfs Help Desk ticket object into the canonical Ticket shape.
 *
 * Field provenance (from POST /list/ticket/ response):
 *   ticket_id, ticket_subject, ticket_status, priority, ticket_due_date,
 *   created_date_time, modified_date_time, deleted,
 *   customer_email, customer_name, customer_phone,
 *   staff { id, name, email }, inbox { id, name, email },
 *   labels [ { id, name } ], custom_fields [ { id, name, value } ]
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Raw inbox/staff sub-object as returned by ProProfs. */
export interface RawProprofsRef {
  id?: string | number
  name?: string
  email?: string
  [key: string]: unknown
}

/** Raw label as returned inside ticket.labels[]. */
export interface RawProprofsLabel {
  id?: string | number
  name?: string
  [key: string]: unknown
}

/** Raw custom field as returned inside ticket.custom_fields[]. */
export interface RawProprofsCustomField {
  id?: string | number
  name?: string
  value?: string
  [key: string]: unknown
}

export interface RawProprofsTicket {
  ticket_id?: string | number
  ticket_subject?: string
  ticket_status?: string
  priority?: string | null
  ticket_due_date?: string | null
  created_date_time?: string
  modified_date_time?: string
  deleted?: string | number | boolean
  customer_email?: string
  customer_name?: string
  customer_phone?: string | null
  staff?: RawProprofsRef | null
  inbox?: RawProprofsRef | null
  labels?: RawProprofsLabel[]
  custom_fields?: RawProprofsCustomField[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  const lower = (s ?? '').toLowerCase()
  switch (lower) {
    case 'new':
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'hold':
      return 'on_hold'
    case 'resolved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  const lower = (p ?? '').toLowerCase()
  if (lower === 'low')    return 'low'
  if (lower === 'normal') return 'normal'
  if (lower === 'high')   return 'high'
  if (lower === 'urgent') return 'urgent'
  return undefined
}

export function transformTicket(raw: RawProprofsTicket): Ticket {
  const status  = mapStatus(raw.ticket_status)
  const id      = String(raw.ticket_id ?? '')
  const tagIds  = (raw.labels ?? []).map((l) => String(l.id ?? l.name ?? ''))
  const staffId = raw.staff?.id != null ? String(raw.staff.id) : undefined
  const inboxId = raw.inbox?.id != null ? String(raw.inbox.id) : undefined

  return {
    id,
    externalId:  id,
    number:      id,
    subject:     pickStr(raw.ticket_subject) ?? '',
    status,
    priority:    mapPriority(raw.priority),
    channel:     'email',           // ProProfs Help Desk is email-centric
    requesterId: pickStr(raw.customer_email) ?? '',
    assigneeId:  staffId,
    teamId:      inboxId,
    tagIds,
    createdAt:   toIso(raw.created_date_time) ?? new Date(0).toISOString(),
    updatedAt:   toIso(raw.modified_date_time),
    resolvedAt:  (status === 'resolved' || status === 'closed') ? toIso(raw.modified_date_time) : undefined,
    platform: 'proprofs-help-desk',
    metadata: strMap({
      inboxName:     raw.inbox?.name,
      staffEmail:    raw.staff?.email,
      customerPhone: raw.customer_phone,
      customerName:  raw.customer_name,
    }),
    raw,
  }
}
