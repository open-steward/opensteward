/**
 * Help Scout conversation → canonical Ticket.
 *
 * Fields from the Get Conversation / List Conversations response docs:
 * https://developer.helpscout.com/mailbox-api/endpoints/conversations/get/
 * https://developer.helpscout.com/mailbox-api/endpoints/conversations/list/
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** "Contains the id, name and email of the assignee, and a type of user or team" */
interface RawPerson {
  id?: number
  type?: string
  first?: string
  last?: string
  email?: string
}

export interface RawHelpScoutConversation {
  id: number
  number?: number
  threads?: number
  /** "one of: chat email phone" */
  type?: string
  folderId?: number
  /** "one of: active all closed open pending spam" */
  status?: string
  /** "one of deleted draft published" */
  state?: string
  subject?: string
  preview?: string
  mailboxId?: number
  assignee?: RawPerson | null
  createdBy?: RawPerson | null
  createdAt?: string
  closedBy?: number
  closedAt?: string | null
  userUpdatedAt?: string | null
  source?: { type?: string; via?: string }
  tags?: Array<{ id?: number; tag?: string; color?: string }>
  primaryCustomer?: RawPerson | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'active':
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'closed':
      return 'closed'
    default:
      // `spam` has no canonical status; neither has anything undocumented.
      return 'unknown'
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
      return 'unknown'
  }
}

function idOf(p: RawPerson | null | undefined): string | undefined {
  return p?.id != null ? String(p.id) : undefined
}

export function transformTicket(raw: RawHelpScoutConversation): Ticket {
  const assigneeType = raw.assignee?.type
  const requester =
    idOf(raw.primaryCustomer) ??
    (raw.createdBy?.type === 'customer' ? idOf(raw.createdBy) : undefined)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: raw.number != null ? String(raw.number) : undefined,
    subject: pickStr(raw.subject) ?? '',
    status: mapStatus(raw.status),
    channel: mapChannel(raw.type),
    requesterId: requester ?? '',
    assigneeId: assigneeType === 'user' ? idOf(raw.assignee) : undefined,
    teamId: assigneeType === 'team' ? idOf(raw.assignee) : undefined,
    tagIds: (raw.tags ?? []).filter((t) => t.id != null).map((t) => String(t.id)),
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    closedAt: raw.status === 'closed' ? toIso(raw.closedAt) : undefined,
    platform: 'helpscout',
    metadata: strMap({
      rawStatus: raw.status,
      state: raw.state,
      mailboxId: raw.mailboxId,
      folderId: raw.folderId,
      sourceType: raw.source?.type,
      sourceVia: raw.source?.via,
      // "UTC time when the last user update occurred" — not a general
      // modified time, so it is not offered as updatedAt.
      userUpdatedAt: raw.userUpdatedAt,
    }),
    raw,
  }
}
