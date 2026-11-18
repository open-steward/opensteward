/**
 * Transform a Genesys Cloud conversation to the canonical Ticket schema.
 *
 * Genesys Cloud uses "conversations" as the top-level interaction record.
 * A conversation can span multiple media types (voice, chat, email, message,
 * callback, etc.).  We map the conversation to a Ticket; participants with
 * purpose='customer' supply the requesterId, participants with
 * purpose='agent'/'user' supply the assigneeId.
 *
 * Participant purposes: customer, agent, user, acd, ivr, voicemail, group,
 * workflow, external.
 *
 * Conversation state: connected | disconnected | alerting | held | none
 *
 * GET /api/v2/conversations — active conversations
 * GET /api/v2/analytics/conversations/{id}/details — historical
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawGenesysParticipant {
  id?: string
  name?: string
  userId?: string
  purpose?: string
  queueId?: string
  state?: string
  startTime?: string
  endTime?: string
  wrapup?: {
    code?: string
    name?: string
    durationSeconds?: number
  } | null
  attributes?: Record<string, string>
  [key: string]: unknown
}

export interface RawGenesysConversation {
  id?: string
  name?: string
  /** ISO-8601 datetime the conversation was created */
  startTime?: string
  endTime?: string
  /** Overall state of the conversation */
  conversationStart?: string
  conversationEnd?: string
  /** Array of participants */
  participants?: RawGenesysParticipant[]
  /** Media type tag on the conversation (voice, chat, email, message, callback) */
  mediaType?: string
  /** Division the conversation belongs to */
  divisionIds?: string[]
  /** Originating phone number / ANI */
  ani?: string
  /** Dialed number / DNIS */
  dnis?: string
  [key: string]: unknown
}

function mapStatus(raw: RawGenesysConversation): TicketStatus {
  // A conversation without an endTime is still active/open.
  // An endTime means it concluded.
  const hasEnded = !!(raw.endTime ?? raw.conversationEnd)
  // Check if any customer participant is in a disconnected state
  const participants = raw.participants ?? []
  const customerPart = participants.find((p) => p.purpose === 'customer' || p.purpose === 'external')
  if (!hasEnded) {
    const partState = customerPart?.state?.toLowerCase()
    if (partState === 'alerting') return 'open'
    if (partState === 'held') return 'on_hold'
    return 'open'
  }
  // Check for wrap-up code indicating resolution
  const agentPart = participants.find((p) => p.purpose === 'agent' || p.purpose === 'user')
  if (agentPart?.wrapup) return 'resolved'
  return 'closed'
}

function mapChannel(raw: RawGenesysConversation): Channel {
  const mt = (raw.mediaType ?? '').toLowerCase()
  switch (mt) {
    case 'voice':
    case 'call':
      return 'voice'
    case 'chat':
    case 'webchat':
      return 'chat'
    case 'email':
      return 'email'
    case 'message':
    case 'messaging':
    case 'sms':
      return 'sms'
    case 'callback':
      return 'voice'
    case 'cobrowse':
      return 'web'
    default:
      return 'other'
  }
}

function findParticipantUserId(
  participants: RawGenesysParticipant[],
  purposes: string[],
): string | undefined {
  for (const purpose of purposes) {
    const p = participants.find((part) => part.purpose === purpose)
    if (p) return p.userId ?? p.id
  }
  return undefined
}

function findQueueId(participants: RawGenesysParticipant[]): string | undefined {
  const acd = participants.find((p) => p.purpose === 'acd')
  return acd?.queueId
}

export function transformTicket(raw: RawGenesysConversation): Ticket {
  const id = pickStr(raw.id) ?? ''
  const participants = raw.participants ?? []
  const status = mapStatus(raw)
  const startAt = toIso(raw.startTime ?? raw.conversationStart)
  const endAt = toIso(raw.endTime ?? raw.conversationEnd)
  const requesterId = findParticipantUserId(participants, ['customer', 'external']) ?? ''
  const assigneeId = findParticipantUserId(participants, ['agent', 'user'])
  const queueId = findQueueId(participants)
  const channel = mapChannel(raw)

  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.name) ?? `Conversation ${id}`,
    status,
    channel,
    requesterId,
    assigneeId,
    teamId: queueId,
    tagIds: [],
    createdAt: startAt ?? new Date(0).toISOString(),
    updatedAt: endAt ?? startAt,
    resolvedAt: (status === 'resolved' || status === 'closed') ? endAt : undefined,
    platform: 'genesys-cloud',
    metadata: strMap({
      mediaType: raw.mediaType,
      ani: raw.ani,
      dnis: raw.dnis,
    }),
    raw,
  }
}
