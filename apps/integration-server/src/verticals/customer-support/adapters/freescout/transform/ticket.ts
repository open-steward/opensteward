/**
 * FreeScout conversation -> canonical Ticket transform.
 *
 * FreeScout calls them "conversations".  Status values: active | pending |
 * closed | spam.  Type values: email | phone | chat.
 * Conversations carry a `tags` array of tag name strings.
 * The `assignee` object (when present) holds the agent id.
 * The `customer` object holds the customer id.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFreescoutConversation {
  id: number
  number?: number
  type?: string
  status?: string
  subject?: string
  preview?: string
  mailboxId?: number
  folderId?: number | null
  assignee?: { id?: number; firstName?: string; lastName?: string } | null
  customer?: { id?: number } | null
  createdBy?: { id?: number; type?: string } | null
  tags?: string[]
  closedAt?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'active':
      return 'open'
    case 'pending':
      return 'pending'
    case 'closed':
      return 'closed'
    case 'spam':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(t: string | undefined): Channel {
  switch (t) {
    case 'email':
      return 'email'
    case 'chat':
      return 'chat'
    case 'phone':
      return 'voice'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawFreescoutConversation): Ticket {
  const status = mapStatus(raw.status)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: raw.number != null ? String(raw.number) : String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    channel: mapChannel(raw.type),
    requesterId: raw.customer?.id != null ? String(raw.customer.id) : '',
    assigneeId: raw.assignee?.id != null ? String(raw.assignee.id) : undefined,
    teamId: raw.mailboxId != null ? String(raw.mailboxId) : undefined,
    tagIds: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    closedAt: raw.closedAt != null ? (toIso(raw.closedAt) ?? undefined) : undefined,
    resolvedAt: status === 'closed' && raw.closedAt != null ? (toIso(raw.closedAt) ?? undefined) : undefined,
    platform: 'freescout',
    metadata: strMap({
      rawType: raw.type,
      rawStatus: raw.status,
      mailboxId: raw.mailboxId,
      folderId: raw.folderId,
    }),
    raw,
  }
}
