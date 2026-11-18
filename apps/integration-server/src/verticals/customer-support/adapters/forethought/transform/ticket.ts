/**
 * Transform a raw Forethought Solve API conversation into the canonical Ticket.
 *
 * Forethought conversations are AI-driven chat sessions between an end-user
 * and the Solve widget. They map to Tickets as follows:
 *
 *   conversation_id  → id / externalId
 *   status           → TicketStatus (active → open, resolved → resolved, etc.)
 *   channel          → always 'chat' (Forethought is chat-native)
 *   user_id          → requesterId (opaque; may be absent for anonymous users)
 *   created_at       → createdAt (ISO-8601)
 *   updated_at       → updatedAt
 *   resolved_at      → resolvedAt (when present)
 *
 * Docs: https://support.forethought.ai/hc/en-us/articles/31636750750227
 */
import type { Ticket, TicketStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Forethought Solve API conversation object.
 * Field names follow the snake_case wire format.
 */
export interface RawForethoughtConversation {
  conversation_id: string
  status?: string
  user_id?: string | null
  subject?: string | null
  channel?: string | null
  /** ISO-8601 timestamp */
  created_at?: string
  /** ISO-8601 timestamp */
  updated_at?: string | null
  /** ISO-8601 timestamp; present when status is 'resolved' */
  resolved_at?: string | null
  /** CSAT score 1–5, if collected */
  csat_score?: number | null
  /** Tags/labels applied by Triage */
  tags?: string[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'active':
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'on_hold':
      return 'on_hold'
    case 'resolved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapCsatRating(raw: RawForethoughtConversation): number | undefined {
  const score = raw.csat_score
  if (typeof score === 'number' && score >= 1 && score <= 5) {
    return Math.round(score)
  }
  return undefined
}

export function transformTicket(raw: RawForethoughtConversation): Ticket {
  const status = mapStatus(raw.status)
  const isEnded = status === 'resolved' || status === 'closed'

  return {
    id: String(raw.conversation_id),
    externalId: String(raw.conversation_id),
    subject: pickStr(raw.subject) ?? '(Forethought conversation)',
    status,
    // Forethought Solve is chat-native; conversations originate from the widget
    channel: 'chat',
    requesterId: pickStr(raw.user_id) ?? 'anonymous',
    tagIds: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    satisfactionRating: mapCsatRating(raw),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: isEnded
      ? (toIso(raw.resolved_at) ?? toIso(raw.updated_at))
      : undefined,
    platform: 'forethought',
    metadata: strMap({ status: raw.status, channel: raw.channel }),
    raw,
  }
}
