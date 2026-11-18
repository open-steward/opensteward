/**
 * Transform a ClearFeed "request" object into the canonical Ticket schema.
 *
 * ClearFeed requests map cleanly to tickets:
 *  - state   → status
 *  - priority → priority (low | normal | high | urgent — identical to canonical)
 *  - author  → requesterId (Slack user ID string)
 *  - assignee.id → assigneeId
 *  - assigned_team.id → teamId
 *  - channel → canonical channel (ClearFeed is Slack-native → 'chat')
 *  - collection.id → used in metadata
 *  - csat_survey → satisfactionRating
 *
 * Pagination: cursor-based (next_cursor in response_metadata).
 * API: GET /v1/rest/requests, GET /v1/rest/requests/:id
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawClearfeedRequest {
  id: number | string
  title?: string | null
  state?: string | null
  priority?: string | null
  author?: string | null
  customer_id?: number | null
  assignee?: { id?: string | null } | null
  assigned_team?: { id?: number | null } | null
  channel?: { id?: string | null; name?: string | null } | null
  collection?: { id?: number | null; name?: string | null } | null
  csat_survey?: Record<string, unknown> | null
  sla_metrics?: {
    resolution_time?: number | null
    first_response_time?: number | null
    first_resolution_time?: number | null
  } | null
  request_thread?: { url?: string | null } | null
  created_at?: string | null
  updated_at?: string | null
  last_message_time?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'in_progress':
      return 'open'
    case 'pending':
      return 'pending'
    case 'on_hold':
      return 'on_hold'
    case 'solved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (p === 'low') return 'low'
  if (p === 'normal') return 'normal'
  if (p === 'high') return 'high'
  if (p === 'urgent') return 'urgent'
  return undefined
}

function mapCsatRating(survey: Record<string, unknown> | null | undefined): number | undefined {
  if (!survey) return undefined
  // ClearFeed CSAT ratings are typically numeric (1–5) or emoji-based.
  const score = survey['score'] ?? survey['rating'] ?? survey['value']
  if (typeof score === 'number') return score
  if (typeof score === 'string') {
    const n = Number(score)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

export function transformTicket(raw: RawClearfeedRequest): Ticket {
  const status = mapStatus(raw.state)
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.title) ?? '',
    status,
    priority: mapPriority(raw.priority),
    // ClearFeed is Slack-native — all traffic goes through Slack channels (chat).
    channel: 'chat',
    requesterId: pickStr(raw.author) ?? '',
    assigneeId: raw.assignee?.id ? String(raw.assignee.id) : undefined,
    teamId: raw.assigned_team?.id != null ? String(raw.assigned_team.id) : undefined,
    tagIds: [],
    satisfactionRating: mapCsatRating(raw.csat_survey ?? undefined),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.updated_at) : undefined,
    platform: 'clearfeed',
    metadata: strMap({
      channelId: raw.channel?.id,
      channelName: raw.channel?.name,
      collectionId: raw.collection?.id,
      collectionName: raw.collection?.name,
      customerId: raw.customer_id,
      requestThreadUrl: raw.request_thread?.url,
      lastMessageTime: raw.last_message_time,
      rawState: raw.state,
    }),
    raw,
  }
}
