/**
 * Transform a Cognigy Live Agent (Chatwoot) conversation into the canonical
 * Ticket schema.
 *
 * Wire shape: conversation object returned by
 *   GET /api/v1/accounts/{account_id}/conversations
 *   GET /api/v1/accounts/{account_id}/conversations/{id}
 *
 * The "channel" field is a string like "Channel::WebWidget", "Channel::Email",
 * "Channel::Api", "Channel::Sms", etc.
 *
 * Timestamps on conversations are Unix epoch integers (seconds).
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Embedded sender/assignee object inside conversation.meta */
interface ConvMeta {
  sender?: { id?: number; name?: string; email?: string }
  assignee?: { id?: number } | null
  team?: { id?: number } | null
  [key: string]: unknown
}

export interface RawCognigyConversation {
  id: number
  status?: string
  priority?: string | null
  /** Channel class string, e.g. "Channel::WebWidget" */
  channel?: string
  inbox_id?: number
  /** Labels array (strings) */
  labels?: string[]
  /** Unix epoch seconds */
  created_at?: number
  /** Unix epoch seconds */
  updated_at?: number
  meta?: ConvMeta
  additional_attributes?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'snoozed':
      return 'on_hold'
    case 'resolved':
      return 'resolved'
    default:
      return 'open'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (p === 'low') return 'low'
  if (p === 'medium') return 'normal'
  if (p === 'high') return 'high'
  if (p === 'urgent') return 'urgent'
  return undefined
}

function mapChannel(c: string | undefined): Channel {
  if (!c) return 'other'
  const lower = c.toLowerCase()
  if (lower.includes('email')) return 'email'
  if (lower.includes('web') || lower.includes('widget')) return 'chat'
  if (lower.includes('sms')) return 'sms'
  if (lower.includes('twitter') || lower.includes('facebook') || lower.includes('instagram')) return 'social'
  if (lower.includes('voice') || lower.includes('phone')) return 'voice'
  if (lower.includes('api')) return 'api'
  return 'other'
}

/** Convert Unix epoch seconds to ISO-8601. Returns undefined for falsy input. */
function epochToIso(epoch: number | undefined): string | undefined {
  if (!epoch) return undefined
  return new Date(epoch * 1000).toISOString()
}

export function transformTicket(raw: RawCognigyConversation): Ticket {
  const status = mapStatus(raw.status)
  const assigneeId = raw.meta?.assignee?.id ? String(raw.meta.assignee.id) : undefined
  const teamId = raw.meta?.team?.id ? String(raw.meta.team.id) : undefined
  const requesterId = raw.meta?.sender?.id ? String(raw.meta.sender.id) : ''
  const createdAt = epochToIso(raw.created_at) ?? new Date(0).toISOString()
  const updatedAt = epochToIso(raw.updated_at)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.meta?.sender?.name) ?? `Conversation #${raw.id}`,
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.channel),
    requesterId,
    assigneeId,
    teamId,
    tagIds: raw.labels ?? [],
    createdAt,
    updatedAt,
    resolvedAt: status === 'resolved' ? updatedAt : undefined,
    platform: 'cognigy',
    metadata: strMap({
      inboxId: raw.inbox_id,
      rawChannel: raw.channel,
      rawStatus: raw.status,
    }),
    raw,
  }
}

export type { RawCognigyConversation as RawCognigyTicket }
