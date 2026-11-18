/**
 * Transform a Smartsupp conversation object into the canonical Ticket schema.
 *
 * Smartsupp conversations have:
 *   id          — string starting with "co"
 *   ext_id      — optional external reference
 *   contact_id  — id of the visitor/contact
 *   status      — "open" | "closed" | "pending"
 *   channel     — { type: string, id?: string } where type is e.g. "widget", "email", "facebook", "viber"
 *   group_id    — optional team id
 *   assigned_ids — currently assigned agent ids
 *   rating_value — 1 | 3 | 5 (normalised to 1-5 in canonical schema)
 *   created_at  — ISO datetime
 *   updated_at  — ISO datetime
 *   finished_at — ISO datetime when conversation was closed
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSmartsuppConversation {
  id: string
  ext_id?: string | null
  contact_id?: string
  status?: string
  channel?: { type?: string; id?: string | null }
  group_id?: string | null
  assigned_ids?: string[]
  agent_ids?: string[]
  rating_value?: number | null
  rating_text?: string | null
  domain?: string | null
  referer?: string | null
  is_offline?: boolean
  is_served?: boolean
  created_at?: string
  updated_at?: string
  finished_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(channel: RawSmartsuppConversation['channel']): Channel {
  const type = channel?.type ?? ''
  switch (type) {
    case 'email':
      return 'email'
    case 'chat':
    case 'widget':
      return 'chat'
    case 'facebook':
    case 'twitter':
    case 'instagram':
      return 'social'
    case 'sms':
      return 'sms'
    case 'api':
      return 'api'
    case 'viber':
    case 'whatsapp':
    case 'telegram':
      return 'other'
    default:
      return 'other'
  }
}

function mapRating(raw: RawSmartsuppConversation): number | undefined {
  const v = raw.rating_value
  if (v === 5) return 5
  if (v === 3) return 3
  if (v === 1) return 1
  return undefined
}

export function transformTicket(raw: RawSmartsuppConversation): Ticket {
  const status = mapStatus(raw.status)
  const assigneeId = raw.assigned_ids?.[0] ?? undefined
  return {
    id: String(raw.id),
    externalId: pickStr(raw.ext_id) ?? String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.domain) ?? String(raw.id),
    status,
    channel: mapChannel(raw.channel),
    requesterId: pickStr(raw.contact_id) ?? '',
    assigneeId: assigneeId ? String(assigneeId) : undefined,
    teamId: raw.group_id ? String(raw.group_id) : undefined,
    tagIds: [],
    satisfactionRating: mapRating(raw),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'closed' ? toIso(raw.finished_at) : undefined,
    closedAt: toIso(raw.finished_at),
    platform: 'smartsupp',
    metadata: strMap({
      channelType: raw.channel?.type,
      channelId: raw.channel?.id,
      isOffline: raw.is_offline,
      isServed: raw.is_served,
      domain: raw.domain,
      referer: raw.referer,
    }),
    raw,
  }
}
