/**
 * Transform a raw Channel Talk UserChat into a canonical Ticket.
 *
 * Channel Talk calls support conversations "UserChats". Key fields:
 *   id            — unique string ID
 *   state         — "opened" | "closed" | "snoozed"
 *   userId        — ID of the end-user (contact)
 *   assigneeId    — ID of the assigned manager (agent)
 *   teamId        — ID of the assigned team
 *   tags          — string[] of tag labels (not IDs)
 *   source        — { type: string } describing chat origin
 *   createdAt     — epoch ms (number)
 *   updatedAt     — epoch ms (number)
 *   closedAt      — epoch ms (number) | undefined
 *
 * Docs: https://developers.channel.io/docs/list-of-userchats-1
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawChannelTalkUserChat {
  id: string
  channelId?: string
  state?: string          // "opened" | "closed" | "snoozed"
  userId?: string
  contactKey?: string
  name?: string           // chat name / subject
  assigneeId?: string | null
  managerIds?: string[]
  teamId?: string | null
  tags?: string[]
  source?: { type?: string } | null
  createdAt?: number      // epoch ms
  updatedAt?: number      // epoch ms
  closedAt?: number | null
  snoozedUntil?: number | null
  [key: string]: unknown
}

function mapStatus(state: string | undefined): TicketStatus {
  switch (state) {
    case 'opened':
      return 'open'
    case 'snoozed':
      return 'pending'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(sourceType: string | undefined): Channel {
  switch (sourceType) {
    case 'email':
      return 'email'
    case 'chat':
    case 'widget':
    case 'popup':
      return 'chat'
    case 'sms':
      return 'sms'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

/** Convert epoch-ms number to ISO-8601 string. */
function epochToIso(ms: number | null | undefined): string | undefined {
  if (ms == null) return undefined
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export function transformTicket(raw: RawChannelTalkUserChat): Ticket {
  const status = mapStatus(raw.state)
  const createdAt = epochToIso(raw.createdAt) ?? new Date(0).toISOString()
  const updatedAt = epochToIso(raw.updatedAt)
  const closedAt = epochToIso(raw.closedAt) ?? undefined

  return {
    id: raw.id,
    externalId: raw.id,
    subject: pickStr(raw.name) ?? `Chat ${raw.id}`,
    status,
    channel: mapChannel(raw.source?.type),
    requesterId: pickStr(raw.userId) ?? pickStr(raw.contactKey) ?? '',
    assigneeId: raw.assigneeId ? String(raw.assigneeId) : undefined,
    teamId: raw.teamId ? String(raw.teamId) : undefined,
    tagIds: raw.tags ?? [],
    createdAt,
    updatedAt,
    resolvedAt: status === 'resolved' || status === 'closed' ? (closedAt ?? updatedAt) : undefined,
    closedAt,
    platform: 'channel-talk',
    metadata: strMap({
      channelId: raw.channelId,
      sourceType: raw.source?.type,
      state: raw.state,
    }),
    raw,
  }
}
