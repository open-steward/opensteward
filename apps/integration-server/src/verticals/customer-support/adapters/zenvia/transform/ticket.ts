/**
 * Maps a Zenvia Customer Cloud Interaction (prospect interaction / attendance)
 * to the canonical Ticket schema.
 *
 * Zenvia Customer Cloud models customer-service sessions as "interactions"
 * on a prospect.  Each interaction has a via (channel), status, assigned agent,
 * and timestamps.  Interactions are the closest equivalent to support tickets
 * in the Zenvia data model.
 *
 * API: GET /prospects/interactions  /  GET /prospect/{id}/interactions
 * Docs: https://sales.zenvia.com/#tag/Interactions
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZenviaInteraction {
  id: string
  prospectId?: string | null
  agentId?: string | null
  groupId?: string | null
  via?: string | null          // walkIn | sms | whatsApp | email | facebook | phoneCall | outboundCall | inboundCall | …
  status?: string | null       // open | finished | transferred | archived | …
  subject?: string | null
  createdAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  updatedAt?: string | null
  output?: {
    comment?: string | null
    reminder?: string | null
    message?: string | null
  } | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'transferred':
      return 'pending'
    case 'finished':
    case 'resolved':
      return 'resolved'
    case 'archived':
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(via: string | null | undefined): Channel {
  switch (via) {
    case 'email':
      return 'email'
    case 'sms':
      return 'sms'
    case 'whatsApp':
    case 'whatsapp':
    case 'chat':
      return 'chat'
    case 'phoneCall':
    case 'inboundCall':
    case 'outboundCall':
      return 'voice'
    case 'facebook':
    case 'instagram':
      return 'social'
    case 'walkIn':
    case 'visit':
      return 'web'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawZenviaInteraction): Ticket {
  const status = mapStatus(raw.status)
  const resolvedOrClosed = status === 'resolved' || status === 'closed'
  // Compose a compound id so that listMessages / getMessage can decode
  // "prospectId:interactionId" and filter to the correct interaction.
  const prospectIdStr = raw.prospectId ? String(raw.prospectId) : ''
  const interactionIdStr = String(raw.id)
  const compoundId =
    prospectIdStr ? `${prospectIdStr}:${interactionIdStr}` : interactionIdStr
  return {
    id: compoundId,
    externalId: interactionIdStr,
    subject: pickStr(raw.subject) ?? pickStr(raw.via) ?? '',
    status,
    channel: mapChannel(raw.via),
    requesterId: pickStr(raw.prospectId) ?? '',
    assigneeId: raw.agentId ? String(raw.agentId) : undefined,
    teamId: raw.groupId ? String(raw.groupId) : undefined,
    tagIds: [],
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt ?? raw.finishedAt ?? raw.startedAt),
    resolvedAt: resolvedOrClosed ? toIso(raw.finishedAt ?? raw.updatedAt) : undefined,
    platform: 'zenvia',
    metadata: strMap({ via: raw.via, rawStatus: raw.status }),
    raw,
  }
}
