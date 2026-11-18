import type { Ticket, TicketStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Chaport chat object returned by:
 *   GET /visitors/:visitorId/chats
 *   GET /visitors/:visitorId/chats/:chatId
 *
 * The `visitorId` is kept alongside the chat so the adapter can compose
 * a stable ticket ID and later fetch events without storing state.
 */
export interface RawChaportChat {
  id: number | string
  startedAt?: string
  startPage?: { url?: string; title?: string }
  rating?: number | null
  ip?: string
  initiator?: string
  stage?: string
  operators?: string[]
  assignedTeam?: string
  lastMessageAt?: string
  lastMessageChannel?: string
  lastMessageChannelId?: string
  missed?: boolean
  events?: unknown[]
  [key: string]: unknown
}

function mapStatus(raw: RawChaportChat): TicketStatus {
  const stage = raw.stage
  if (stage === 'closed' || stage === 'finished') return 'closed'
  if (stage === 'resolved') return 'resolved'
  if (stage === 'pending') return 'pending'
  return 'open'
}

function normaliseRating(r: number | null | undefined): number | undefined {
  if (r == null) return undefined
  // Chaport stores integer 1-5 directly
  if (r >= 1 && r <= 5) return Math.round(r)
  return undefined
}

/**
 * Compose a stable ticket id from visitorId + chatId so callers can later
 * split it for chat-event fetches.
 */
export function chaportTicketId(visitorId: string, chatId: string | number): string {
  return `${visitorId}:${chatId}`
}

export function transformTicket(raw: RawChaportChat, visitorId: string): Ticket {
  const chatId = String(raw.id)
  const status = mapStatus(raw)
  return {
    id: chaportTicketId(visitorId, chatId),
    externalId: chatId,
    subject: pickStr(raw.startPage?.title) ?? pickStr(raw.startPage?.url) ?? `Chat ${chatId}`,
    status,
    channel: 'chat',
    requesterId: visitorId,
    assigneeId: raw.operators?.[0] ?? undefined,
    teamId: pickStr(raw.assignedTeam),
    tagIds: [],
    satisfactionRating: normaliseRating(raw.rating),
    createdAt: toIso(raw.startedAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.lastMessageAt),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.lastMessageAt) ?? toIso(raw.startedAt) : undefined,
    platform: 'chaport',
    metadata: strMap({
      visitorId,
      chatId,
      startUrl: raw.startPage?.url,
      initiator: raw.initiator,
      lastMessageChannel: raw.lastMessageChannel,
      missed: raw.missed,
    }),
    raw,
  }
}
