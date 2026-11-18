/**
 * Transform a Rasayel Conversation into the canonical Ticket shape.
 *
 * Fields read, as Rasayel's published GraphQL schema declares them on
 * `type Conversation` (https://developers.rasayel.io/types/Conversation):
 *   id: Int!, uuid: String!, state: ConversationStateEnum!,
 *   channelType: ChannelTypeEnum!, contact: ChannelUser! ("The conversing user
 *   on the other end of the conversation"), assignee: AppUser,
 *   assignedTeam: Team, tags: TagConnection!, createdAt: Int!, updatedAt: Int,
 *   lastClosedAt: Int
 *
 * Timestamps are Unix seconds: the `conversation.created` webhook example
 * (https://developers.rasayel.io/webhooks/conversation-created) carries a
 * Conversation with `"createdAt": 1652783952`.
 *
 * A conversation has no subject in Rasayel's schema, so `subject` is empty.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { epochToIso, strMap } from './shared'

export interface RawRasayelConversation {
  id: number
  uuid: string
  state: string
  channelType: string
  contact: { id: number }
  assignee?: { id: number } | null
  assignedTeam?: { id: number } | null
  tags?: { nodes?: Array<{ id: number }> }
  createdAt: number
  updatedAt?: number | null
  lastClosedAt?: number | null
}

/**
 * `enum ConversationStateEnum` values whose meaning the name states outright.
 * The bot-, campaign- and sequence-controlled states, WAITING, BLOCKED and
 * TERMINATED carry no documented meaning and map to 'unknown'.
 */
const STATE: Record<string, TicketStatus> = {
  UNANSWERED: 'open',
  OPENED: 'open',
  SNOOZED: 'on_hold',
  CLOSED: 'closed',
}

/** `enum ChannelTypeEnum`, grouped by the kind of channel each value names. */
const CHANNEL: Record<string, Channel> = {
  EMAIL: 'email',
  TWILIO_SMS: 'sms',
  TWILIO_WABA: 'social',
  MESSAGEBIRD_WABA: 'social',
  TELNYX_WABA: 'social',
  DIALOG_WABA: 'social',
  CLOUD_WABA: 'social',
  CM_WABA: 'social',
  SANDBOX_WABA: 'social',
  FACEBOOK: 'social',
  INSTAGRAM: 'social',
  TWITTER: 'social',
  TELEGRAM: 'social',
  LINE: 'social',
  VIBER: 'social',
  VKONTAKTE: 'social',
}

export function transformTicket(raw: RawRasayelConversation): Ticket {
  const updatedAt = raw.updatedAt != null ? epochToIso(raw.updatedAt) : undefined
  const closedAt =
    raw.state === 'CLOSED' && raw.lastClosedAt != null ? epochToIso(raw.lastClosedAt) : undefined
  return {
    id: String(raw.id),
    externalId: raw.uuid,
    subject: '',
    status: STATE[raw.state] ?? 'unknown',
    channel: CHANNEL[raw.channelType] ?? 'other',
    requesterId: String(raw.contact.id),
    ...(raw.assignee ? { assigneeId: String(raw.assignee.id) } : {}),
    ...(raw.assignedTeam ? { teamId: String(raw.assignedTeam.id) } : {}),
    tagIds: (raw.tags?.nodes ?? []).map((t) => String(t.id)),
    createdAt: epochToIso(raw.createdAt),
    ...(updatedAt ? { updatedAt } : {}),
    ...(closedAt ? { closedAt } : {}),
    platform: 'rasayel',
    metadata: strMap({ state: raw.state, channelType: raw.channelType }),
    raw,
  }
}
