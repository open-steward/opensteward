/**
 * Transform a Userlike conversation object into the canonical Ticket shape.
 *
 * Userlike conversation statuses: "pending" (waiting for agent), "active"
 * (agent assigned), "ended" (closed). There is no native priority field.
 * Channel comes from contact_channel.type (e.g. "website", "whatsapp",
 * "email", "sms", "facebook", "telegram").
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawUserlikeConversation {
  id: number
  status?: string
  operator_assigned_to?: number | null
  contact?: {
    id?: number
    name?: string
    email?: string
  }
  contact_channel?: {
    type?: string
    state?: string
  }
  last_message?: {
    id?: string
    body?: string
    sent_at?: string
  }
  topics?: Array<{ id?: number; name?: string }>
  um_widget?: { id?: number; name?: string }
  rate?: number | null
  feedback_message?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'pending':
      return 'pending'
    case 'active':
      return 'open'
    case 'ended':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(type: string | undefined): Channel {
  switch (type) {
    case 'email':
      return 'email'
    case 'website':
    case 'chat':
      return 'chat'
    case 'sms':
      return 'sms'
    case 'whatsapp':
    case 'facebook':
    case 'telegram':
    case 'instagram':
    case 'twitter':
      return 'social'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawUserlikeConversation): Ticket {
  const status = mapStatus(raw.status)
  const channelType = raw.contact_channel?.type
  const topicIds = (raw.topics ?? [])
    .map((t) => (t.id != null ? String(t.id) : undefined))
    .filter((v): v is string => v !== undefined)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.last_message?.body)?.slice(0, 120) ?? '',
    status,
    channel: mapChannel(channelType),
    requesterId: raw.contact?.id != null ? String(raw.contact.id) : '',
    assigneeId: raw.operator_assigned_to != null ? String(raw.operator_assigned_to) : undefined,
    tagIds: topicIds,
    satisfactionRating: typeof raw.rate === 'number' ? raw.rate : undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'closed' ? toIso(raw.updated_at) : undefined,
    platform: 'userlike',
    metadata: strMap({
      channel_type: channelType,
      channel_state: raw.contact_channel?.state,
      widget_id: raw.um_widget?.id,
      widget_name: raw.um_widget?.name,
      feedback: raw.feedback_message,
    }),
    raw,
  }
}
