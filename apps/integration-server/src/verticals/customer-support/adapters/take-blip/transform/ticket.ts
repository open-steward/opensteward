/**
 * Transform a raw Take Blip ticket (application/vnd.iris.ticket+json) to the
 * canonical Ticket schema.
 *
 * Take Blip ticket status values:
 *   Waiting, Open, ClosedAttendant, ClosedClient, ClosedClientInactivity
 *
 * Docs: https://docs.blip.ai/#desk
 */
import type { Ticket, TicketStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTakeBlipTicket {
  id?: string
  sequentialId?: number | string
  ownerIdentity?: string
  customerIdentity?: string
  customerDomain?: string
  agentIdentity?: string | null
  teamName?: string | null
  team?: string | null
  status?: string
  storageDate?: string
  openDate?: string
  closeDate?: string | null
  tags?: string[] | null
  rating?: number | null
  unreadMessages?: number
  closed?: boolean
  customerInput?: unknown
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'Open':
      return 'open'
    case 'Waiting':
      return 'pending'
    case 'ClosedAttendant':
    case 'ClosedClient':
    case 'ClosedClientInactivity':
      return 'closed'
    default:
      return 'open'
  }
}

export function transformTicket(raw: RawTakeBlipTicket): Ticket {
  const status = mapStatus(raw.status)
  const ticketId = pickStr(raw.id) ?? ''
  const seqId = raw.sequentialId != null ? String(raw.sequentialId) : ticketId
  // Take Blip does not expose priority; omit
  const resolvedAt =
    status === 'closed' ? toIso(raw.closeDate ?? raw.storageDate) : undefined

  return {
    id: ticketId,
    externalId: ticketId,
    number: seqId,
    subject: '',
    status,
    channel: 'chat',
    requesterId: pickStr(raw.customerIdentity) ?? '',
    assigneeId: raw.agentIdentity ? pickStr(raw.agentIdentity) : undefined,
    teamId: pickStr(raw.teamName ?? raw.team),
    tagIds: raw.tags ?? [],
    satisfactionRating:
      typeof raw.rating === 'number' && Number.isInteger(raw.rating) && raw.rating >= 1 && raw.rating <= 5
        ? raw.rating
        : undefined,
    createdAt: toIso(raw.storageDate ?? raw.openDate) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.openDate ?? raw.storageDate),
    resolvedAt,
    platform: 'take-blip',
    metadata: strMap({
      ownerIdentity: raw.ownerIdentity,
      customerDomain: raw.customerDomain,
      rawStatus: raw.status,
      unreadMessages: raw.unreadMessages,
    }),
    raw,
  }
}
