/**
 * Transform a Kore.ai SmartAssist conversation record into the canonical Ticket.
 *
 * API endpoint: GET /agentassist/api/v1/public/{streamId}/conversations
 * Response envelope: { results: RawKoreAiConversation[], skip, limit, hasMore, … }
 *
 * Status mapping:
 *   ACTIVE | OPEN  → open
 *   IDLE           → pending
 *   CLOSED         → closed
 *   TERMINATED     → closed
 *   OVERDUE        → open   (still active, just overdue SLA)
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKoreAiConversation {
  /** Internal Mongo ID */
  _id?: string
  /** Alias exposed by some response shapes */
  conversationId?: string
  botSessionId?: string
  botId?: string
  userId?: string
  orgId?: string
  accountId?: string
  source?: string
  language?: string
  status?: string
  /** ISO timestamp */
  startTime?: string
  /** ISO timestamp */
  endTime?: string
  /** ISO timestamp */
  createdAt?: string
  /** ISO timestamp */
  updatedAt?: string
  /** ISO timestamp */
  acceptedAt?: string
  /** 0–4 integer (higher = more urgent) or null */
  priority?: number | null
  keyIntentName?: string
  keyIntentUserInput?: string
  conversationType?: string
  waitTime?: number
  participants?: Array<{ agentId?: string; name?: string; status?: string }>
  queues?: Array<{ id?: string; name?: string; type?: string; status?: string }>
  sentimentTone?: { sentiment?: string; emoji?: string; strength?: string }
  dispositions?: { status?: string; remarks?: string }
  userInfo?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'OPEN':
    case 'OVERDUE':
      return 'open'
    case 'IDLE':
      return 'pending'
    case 'CLOSED':
    case 'TERMINATED':
      return 'closed'
    default:
      return 'open'
  }
}

/**
 * Kore.ai priority is an integer 0–4 (or null).
 * Map to canonical TicketPriority: 0/1 → low, 2 → normal, 3 → high, 4 → urgent
 */
function mapPriority(p: number | null | undefined): TicketPriority | undefined {
  if (p === null || p === undefined) return undefined
  if (p <= 1) return 'low'
  if (p === 2) return 'normal'
  if (p === 3) return 'high'
  return 'urgent'
}

function mapChannel(source: string | undefined): Channel {
  switch ((source ?? '').toLowerCase()) {
    case 'email':
      return 'email'
    case 'chat':
    case 'webchat':
    case 'web':
      return 'chat'
    case 'voice':
    case 'phone':
      return 'voice'
    case 'sms':
      return 'sms'
    case 'twitter':
    case 'facebook':
    case 'instagram':
      return 'social'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawKoreAiConversation): Ticket {
  const id = pickStr(raw._id ?? raw.conversationId ?? raw.botSessionId) ?? ''
  const status = mapStatus(raw.status)
  const assigneeId = raw.participants?.find(
    (p) => p.status === 'ASSIGNED' || p.agentId,
  )?.agentId
  const queueId = raw.queues?.[0]?.id

  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.keyIntentName) ?? pickStr(raw.conversationType) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.source),
    requesterId: pickStr(raw.userId) ?? '',
    assigneeId: assigneeId ? pickStr(assigneeId) : undefined,
    teamId: queueId ? pickStr(queueId) : undefined,
    tagIds: [],
    createdAt: toIso(raw.createdAt ?? raw.startTime) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    resolvedAt:
      status === 'closed'
        ? toIso(raw.endTime ?? raw.updatedAt)
        : undefined,
    platform: 'kore-ai',
    metadata: strMap({
      source: raw.source,
      language: raw.language,
      botId: raw.botId,
      orgId: raw.orgId,
      sentiment: raw.sentimentTone?.sentiment,
      dispositionStatus: raw.dispositions?.status,
      keyIntentUserInput: raw.keyIntentUserInput,
    }),
    raw,
  }
}
