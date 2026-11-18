/**
 * Intercom conversation → canonical Ticket.
 *
 * Intercom's support unit is the conversation (`GET /conversations`,
 * `GET /conversations/{id}`, `POST /conversations/search`). Field names and
 * enums are the `conversation` / `conversation_list_item` schemas of the 2.16
 * OpenAPI description:
 * https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { fromUnix, pickId, pickStr, strMap } from './shared'

export interface RawIntercomConversation {
  type?: string
  id: string | number
  title?: string | null
  created_at?: number
  updated_at?: number
  /** "Can be set to "open", "closed" or "snoozed"." */
  state?: string
  open?: boolean
  /** enum: none, low, medium, high, urgent */
  priority?: string | null
  admin_assignee_id?: number | string | null
  team_assignee_id?: number | string | null
  tags?: {
    type?: string
    tags?: Array<{ type?: string; id?: string | number; name?: string }>
  } | null
  /** "The rating, between 1 and 5, for the conversation." */
  conversation_rating?: { rating?: number | null } | null
  source?: {
    type?: string
    id?: string | null
    delivered_as?: string
    subject?: string | null
    body?: string | null
    author?: { type?: string; id?: string | null; name?: string | null; email?: string | null }
    attachments?: unknown[]
  } | null
  contacts?: {
    type?: string
    contacts?: Array<{ id?: string; external_id?: string | null }>
  } | null
  statistics?: { last_close_at?: number | null } | null
  [key: string]: unknown
}

function mapStatus(state: string | undefined): TicketStatus {
  switch (state) {
    case 'open':
      return 'open'
    case 'snoozed':
      return 'on_hold'
    case 'closed':
      return 'closed'
    default:
      return 'unknown'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  switch (p) {
    case 'low':
      return 'low'
    case 'medium':
      return 'normal'
    case 'high':
      return 'high'
    case 'urgent':
      return 'urgent'
    default:
      // `none` and absent: no priority set.
      return undefined
  }
}

/**
 * `source.type` — the accepted values in Search Conversations: `conversation`,
 * `email`, `facebook`, `instagram`, `phone_call`, `phone_switch`, `push`,
 * `sms`, `twitter` and `whatsapp`. `conversation` is a Messenger chat.
 */
function mapChannel(t: string | undefined): Channel {
  switch (t) {
    case 'conversation':
      return 'chat'
    case 'email':
      return 'email'
    case 'facebook':
    case 'instagram':
    case 'twitter':
    case 'whatsapp':
      return 'social'
    case 'phone_call':
    case 'phone_switch':
      return 'voice'
    case 'sms':
      return 'sms'
    case 'push':
      return 'other'
    default:
      return 'unknown'
  }
}

function mapRating(raw: RawIntercomConversation): number | undefined {
  const r = raw.conversation_rating?.rating
  return typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 5 ? r : undefined
}

export function transformTicket(raw: RawIntercomConversation): Ticket {
  const id = String(raw.id)
  const status = mapStatus(raw.state)
  return {
    id,
    externalId: id,
    subject: pickStr(raw.title) ?? pickStr(raw.source?.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.source?.type),
    requesterId: pickStr(raw.contacts?.contacts?.[0]?.id) ?? '',
    assigneeId: pickId(raw.admin_assignee_id),
    teamId: pickId(raw.team_assignee_id),
    tagIds: (raw.tags?.tags ?? [])
      .map((t) => pickStr(t.id))
      .filter((t): t is string => t !== undefined),
    satisfactionRating: mapRating(raw),
    createdAt: fromUnix(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: fromUnix(raw.updated_at),
    closedAt: status === 'closed' ? fromUnix(raw.statistics?.last_close_at) : undefined,
    platform: 'intercom',
    metadata: strMap({
      state: raw.state,
      priority: raw.priority,
      sourceType: raw.source?.type,
      deliveredAs: raw.source?.delivered_as,
    }),
    raw,
  }
}
