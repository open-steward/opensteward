/**
 * Transform an Unthread conversation object into the canonical Ticket schema.
 *
 * Unthread conversations map directly to support tickets. Status values:
 *   open | in_progress | on_hold | closed
 *
 * Channel is derived from conversation type:
 *   slack | triage -> chat; email -> email; (default) other
 *
 * Priority: not currently returned by Unthread list API — omitted.
 * Tags: array of { id, name } objects on the conversation.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import type { RawUnthreadTag } from './tag'

export interface RawUnthreadConversation {
  id: string
  friendlyId?: string | null
  title?: string | null
  status?: string | null
  priority?: string | null
  channelId?: string | null
  customerId?: string | null
  assignedToUserId?: string | null
  /** Conversation type determines channel: 'slack' | 'triage' | 'email' */
  type?: string | null
  tags?: RawUnthreadTag[]
  createdAt?: string | null
  updatedAt?: string | null
  closedAt?: string | null
  statusUpdatedAt?: string | null
  initialMessage?: { text?: string | null } | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'in_progress':
      return 'in_progress'
    case 'on_hold':
      return 'on_hold'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(type: string | null | undefined): Channel {
  switch (type) {
    case 'email':
      return 'email'
    case 'slack':
    case 'triage':
      return 'chat'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawUnthreadConversation): Ticket {
  const status = mapStatus(raw.status)
  const tagIds = (raw.tags ?? []).map((t) => pickStr(t.id) ?? pickStr(t.name) ?? '').filter(Boolean)

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.friendlyId) ?? raw.id,
    subject: pickStr(raw.title) ?? pickStr(raw.initialMessage?.text) ?? '',
    status,
    priority: undefined,
    channel: mapChannel(raw.type),
    requesterId: pickStr(raw.customerId) ?? '',
    assigneeId: raw.assignedToUserId ? pickStr(raw.assignedToUserId) : undefined,
    teamId: undefined,
    tagIds,
    parentTicketId: undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.closedAt ?? raw.statusUpdatedAt) : undefined,
    closedAt: toIso(raw.closedAt),
    platform: 'unthread',
    metadata: strMap({ type: raw.type, channelId: raw.channelId }),
    raw,
  }
}
