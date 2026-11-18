/**
 * Zoho Desk ticket → canonical Ticket.
 *
 * Fields are the ones documented for GET /api/v1/tickets, GET
 * /api/v1/tickets/{ticket_id} and GET /api/v1/tickets/search
 * (https://desk.zoho.com/DeskAPIDocument, Tickets). Ids arrive as strings.
 *
 * - `statusType` is documented as OPEN / ONHOLD / CLOSED; the examples send
 *   "Open", "On Hold" and "Closed", so it is compared uppercased with spaces
 *   removed. `status` "can be a system-defined or custom value that falls
 *   under one of the status types", so it is read only when `statusType` is
 *   absent (the list example omits it), and a custom status that is not a
 *   status-type name maps to `unknown`.
 * - `priority`: "System-defined values such as Medium, High, and Low. Custom
 *   values are also supported." Custom values map to no priority.
 * - Tickets carry no tag names or ids (only `tagCount`), so `tagIds` is empty.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoDeskTicket {
  id: string | number
  ticketNumber?: string | null
  subject?: string | null
  status?: string | null
  statusType?: string | null
  priority?: string | null
  channel?: string | null
  contactId?: string | null
  assigneeId?: string | null
  teamId?: string | null
  departmentId?: string | null
  accountId?: string | null
  createdTime?: string | null
  modifiedTime?: string | null
  closedTime?: string | null
  [key: string]: unknown
}

function statusKey(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/[\s_]+/g, '')
}

function mapStatus(raw: RawZohoDeskTicket): TicketStatus {
  const key = statusKey(raw.statusType) || statusKey(raw.status)
  switch (key) {
    case 'OPEN':
      return 'open'
    case 'ONHOLD':
      return 'on_hold'
    case 'CLOSED':
      return 'closed'
    default:
      return 'unknown'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  switch ((p ?? '').toLowerCase()) {
    case 'low':
      return 'low'
    case 'medium':
    case 'normal':
      return 'normal'
    case 'high':
      return 'high'
    default:
      return undefined
  }
}

/**
 * Channel names seen in the ticket and thread examples: Email/EMAIL, Chat,
 * Phone, Web, Forums, Feedback, Facebook, Twitter, Instagram, YouTube and
 * custom (WhatsApp) channels.
 */
function mapChannel(c: string | null | undefined): Channel {
  switch ((c ?? '').toLowerCase()) {
    case 'email':
      return 'email'
    case 'chat':
      return 'chat'
    case 'phone':
      return 'voice'
    case 'web':
      return 'web'
    case 'facebook':
    case 'twitter':
    case 'instagram':
    case 'youtube':
      return 'social'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawZohoDeskTicket): Ticket {
  const status = mapStatus(raw)
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.ticketNumber),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.channel),
    requesterId: pickStr(raw.contactId) ?? '',
    assigneeId: pickStr(raw.assigneeId),
    teamId: pickStr(raw.teamId),
    tagIds: [],
    createdAt: toIso(raw.createdTime) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.modifiedTime),
    closedAt: toIso(raw.closedTime),
    platform: 'zoho-desk',
    metadata: strMap({
      rawStatus: raw.status,
      rawChannel: raw.channel,
      rawPriority: raw.priority,
      departmentId: raw.departmentId,
      accountId: raw.accountId,
    }),
    raw,
  }
}
