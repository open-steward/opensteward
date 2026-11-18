/**
 * Transform a Freshchat conversation into the canonical Ticket schema.
 *
 * Freshchat conversations are the closest concept to a "ticket". The
 * `status` field uses Freshchat-native values: "new", "assigned",
 * "resolved", "reopened". Priority is not a top-level field in Freshchat
 * REST API v2 but may appear in conversation properties (cf_priority).
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { strMap, toIso } from './shared'

export interface RawFreshchatConversation {
  conversation_id: string
  app_id?: string
  channel_id?: string
  status?: string
  assigned_agent_id?: string | null
  assigned_org_agent_id?: string | null
  assigned_group_id?: string | null
  assigned_org_group_id?: string | null
  /** User(s) who initiated the conversation */
  users?: Array<{ id?: string }>
  messages?: Array<{ message_parts?: Array<{ text?: { content?: string } }> }>
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'new':
    case 'assigned':
      return 'open'
    case 'resolved':
      return 'resolved'
    case 'reopened':
      return 'open'
    default:
      return 'open'
  }
}

/** Extract the first message text as the conversation subject/summary. */
function extractSubject(raw: RawFreshchatConversation): string {
  const firstMsg = raw.messages?.[0]
  const textPart = firstMsg?.message_parts?.find((p) => p.text?.content)
  const text = textPart?.text?.content
  if (text) return text.slice(0, 200)
  return raw.conversation_id ?? ''
}

/** Freshchat is a chat-first platform; default channel is chat. */
function mapChannel(_raw: RawFreshchatConversation): Channel {
  return 'chat'
}

export function transformTicket(raw: RawFreshchatConversation): Ticket {
  const status = mapStatus(raw.status)
  const requesterId = raw.users?.[0]?.id ? String(raw.users[0].id) : ''
  return {
    id: String(raw.conversation_id),
    externalId: String(raw.conversation_id),
    number: String(raw.conversation_id),
    subject: extractSubject(raw),
    status,
    priority: undefined,
    channel: mapChannel(raw),
    requesterId,
    assigneeId: raw.assigned_agent_id ? String(raw.assigned_agent_id) : undefined,
    teamId: raw.assigned_group_id ? String(raw.assigned_group_id) : undefined,
    tagIds: [],
    parentTicketId: undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.created_time) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_time),
    resolvedAt: status === 'resolved' ? toIso(raw.updated_time) : undefined,
    platform: 'freshchat',
    metadata: strMap({
      appId: raw.app_id,
      channelId: raw.channel_id,
      rawStatus: raw.status,
    }),
    raw,
  }
}
