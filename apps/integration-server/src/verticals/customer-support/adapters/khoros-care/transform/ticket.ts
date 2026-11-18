/**
 * Transform a Khoros Care conversation into the canonical Ticket shape.
 *
 * `GET /api/v2/conversations/{lswUuid}` returns `{ status, data: [conv] }`.
 * The documented examples (Facebook, Instagram) carry `lswUuid`,
 * `displayNumber`, `status`, `assignedToAgent`, `createDate` (epoch ms),
 * `primaryMessage` (with `network` and `author.lswUuid`), `messages`, `tags`
 * (`tagId`), `priority` (an integer), `workQueue` (`id`, `lswUuid`) and
 * `notes`. There is no subject field.
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/reference/lswuuid-1
 *       https://developer.khoros.com/khoroscaredevdocs/reference/facebook-conversations
 *       https://developer.khoros.com/khoroscaredevdocs/reference/instagram-conversations
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import type { RawKhorosCareMessage } from './message'
import { epochMsToIso, pickStr, required, strMap } from './shared'

export interface RawKhorosCareConversation {
  lswUuid?: string
  displayNumber?: number
  status?: string
  encodedCaseDisposition?: number
  customDisposition?: string
  assignedToAgent?: { name?: string; email?: string; lswUuid?: string } | null
  createDate?: number
  primaryMessage?: RawKhorosCareMessage
  messages?: RawKhorosCareMessage[]
  tags?: Array<{ tagId?: number; lswUuid?: string }>
  priority?: number
  workQueue?: { id?: number; lswUuid?: string } | null
  responsePortalLink?: string
  lswPermalink?: string
  totalResponses?: number
  [key: string]: unknown
}

/**
 * The docs publish no list of conversation states. The only one whose
 * meaning is plain is `INPROGRESS` (Facebook example); anything else
 * (`RESPONDED` in the Instagram example) is kept verbatim in metadata.
 */
function mapStatus(s: string | undefined): TicketStatus {
  return s === 'INPROGRESS' ? 'in_progress' : 'unknown'
}

/** `primaryMessage.network` values the examples show: facebook, instagram. */
function mapChannel(network: string | undefined): Channel {
  switch (network) {
    case 'facebook':
    case 'instagram':
      return 'social'
    default:
      return 'unknown'
  }
}

export function transformTicket(raw: RawKhorosCareConversation): Ticket {
  const id = required(pickStr(raw.lswUuid), 'conversation lswUuid')
  const network = raw.primaryMessage?.network
  return {
    id,
    externalId: id,
    number: raw.displayNumber != null ? String(raw.displayNumber) : undefined,
    // Care conversations have no subject; the schema requires a string.
    subject: '',
    status: mapStatus(raw.status),
    channel: mapChannel(network),
    requesterId: required(
      pickStr(raw.primaryMessage?.author?.lswUuid),
      `primaryMessage.author.lswUuid of conversation ${id}`,
    ),
    assigneeId: pickStr(raw.assignedToAgent?.lswUuid),
    teamId: raw.workQueue?.id != null ? String(raw.workQueue.id) : undefined,
    tagIds: (raw.tags ?? []).flatMap((t) => (t.tagId != null ? [String(t.tagId)] : [])),
    createdAt: required(epochMsToIso(raw.createDate), `createDate of conversation ${id}`),
    platform: 'khoros-care',
    metadata: strMap({
      status: raw.status,
      network,
      priority: raw.priority,
      encodedCaseDisposition: raw.encodedCaseDisposition,
      customDisposition: raw.customDisposition,
      workQueueLswUuid: raw.workQueue?.lswUuid,
      totalResponses: raw.totalResponses,
      responsePortalLink: raw.responsePortalLink,
      lswPermalink: raw.lswPermalink,
    }),
    raw,
  }
}
