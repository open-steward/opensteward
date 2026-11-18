/**
 * Ada conversations → canonical Ticket.
 *
 * Two documented shapes, one transform each:
 *
 * - the Data Export API's Conversation, from
 *   GET /api/v2/export/conversations
 *   (https://docs.ada.cx/data-export-conversation-object/get-conversations);
 * - the Conversations API's conversation, from
 *   GET /api/v2/conversations/{conversation_id}/
 *   (https://docs.ada.cx/reference/conversations/get-conversation-by-id).
 *
 * Neither documents a subject. `inquiry_summary` is "An automatically
 * generated summary of the customer's inquiry", which the vertical's schema
 * firewall refuses ("no AI-generated summaries", schema/shared.ts), so the
 * subject is empty. `csat` is documented only as "Object of customer
 * satisfaction survey data" with no scale, so no satisfactionRating is
 * derived from it.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Data Export Conversation: only the documented fields this transform reads. */
export interface RawAdaExportConversation {
  /** "Unique ID for the conversation record" */
  _id?: string
  /** "Ada ID of the chatter having this conversation" */
  chatter_id?: string
  /** "The End User ID used to identify the chatter profile in the conversation" (nullable) */
  end_user_id?: string | null
  /** "The unique ID of the agent who most recently handled the conversation" */
  last_agent_id?: string | null
  /** "Ada platform through which this conversation occurred" (example: "chat") */
  platform?: string
  /** "The channel used by Oauth" */
  oauth_channel?: string
  /** "Whether the chatter escalated to a live agent during this conversation" */
  is_escalated?: boolean
  /** "The language the chatter used" */
  language?: string
  /** "Date and time the record was created (UTC)" */
  date_created?: string
  /** "Last date and time the record was updated (UTC)" */
  date_updated?: string
  [key: string]: unknown
}

/** Conversations API conversation: every documented field. */
export interface RawAdaConversation {
  id?: string
  channel_id?: string
  end_user_id?: string
  /** "Allowed values: `active`, `ended`" */
  status?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * `platform` is documented with one example value, "chat". No list of values
 * is published, so anything else is left for reconciliation as 'unknown'.
 */
function exportChannel(platform: string | undefined): Channel {
  return platform === 'chat' ? 'chat' : 'unknown'
}

export function transformExportConversation(raw: RawAdaExportConversation): Ticket {
  const id = pickStr(raw._id)
  if (!id) throw new Error('ada-cx: export conversation has no _id')
  const createdAt = toIso(raw.date_created, true)
  if (!createdAt) throw new Error(`ada-cx: export conversation ${id} has no date_created`)
  return {
    id,
    externalId: id,
    subject: '',
    // The Data Export Conversation documents no status field.
    status: 'unknown',
    channel: exportChannel(raw.platform),
    requesterId: pickStr(raw.end_user_id) ?? '',
    assigneeId: pickStr(raw.last_agent_id),
    tagIds: [],
    createdAt,
    updatedAt: toIso(raw.date_updated, true),
    platform: 'ada-cx',
    metadata: strMap({
      platform: raw.platform,
      oauthChannel: raw.oauth_channel,
      isEscalated: raw.is_escalated,
      language: raw.language,
      chatterId: raw.chatter_id,
    }),
    raw,
  }
}

function conversationStatus(status: string | undefined): TicketStatus {
  if (status === 'active') return 'open'
  if (status === 'ended') return 'closed'
  return 'unknown'
}

export function transformConversation(raw: RawAdaConversation): Ticket {
  const id = pickStr(raw.id)
  if (!id) throw new Error('ada-cx: conversation has no id')
  const createdAt = toIso(raw.created_at)
  if (!createdAt) throw new Error(`ada-cx: conversation ${id} has no created_at`)
  return {
    id,
    externalId: id,
    subject: '',
    status: conversationStatus(raw.status),
    // `channel_id` is "The ID of the channel", not its kind.
    channel: 'unknown',
    requesterId: pickStr(raw.end_user_id) ?? '',
    tagIds: [],
    createdAt,
    updatedAt: toIso(raw.updated_at),
    platform: 'ada-cx',
    metadata: strMap({ channelId: raw.channel_id }),
    raw,
  }
}
