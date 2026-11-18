/**
 * Kayako case → canonical Ticket transform.
 *
 * Kayako calls tickets "cases". Status values: NEW, OPEN, PENDING,
 * COMPLETED, CLOSED, CUSTOM. Priority: LOW, NORMAL, HIGH, URGENT.
 * Source channel: MAIL, HELPCENTER, TWITTER, MESSENGER, FACEBOOK, NOTE.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Nested identity object used for requester / assigned_agent */
export interface KayakoUserRef {
  id?: number
  full_name?: string
  [key: string]: unknown
}

/** Nested team object */
export interface KayakoTeamRef {
  id?: number
  title?: string
  [key: string]: unknown
}

/** Nested tag object */
export interface KayakoTagRef {
  id?: number
  name?: string
  [key: string]: unknown
}

export interface RawKayakoCase {
  id: number
  legacy_id?: string | null
  subject?: string
  status?: { label?: string } | string
  priority?: { label?: string } | string
  source_channel?: string
  requester?: KayakoUserRef | null
  assigned_agent?: KayakoUserRef | null
  assigned_team?: KayakoTeamRef | null
  tags?: KayakoTagRef[]
  rating?: string | null
  post_count?: number
  created_at?: string
  updated_at?: string
  is_closed?: boolean
  state?: string
  [key: string]: unknown
}

function mapStatus(raw: RawKayakoCase): TicketStatus {
  const label =
    typeof raw.status === 'object' && raw.status !== null
      ? String(raw.status.label ?? '').toLowerCase()
      : String(raw.status ?? '').toLowerCase()
  if (raw.is_closed) return 'closed'
  switch (label) {
    case 'new':
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'completed':
    case 'solved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(raw: RawKayakoCase): TicketPriority | undefined {
  const label =
    typeof raw.priority === 'object' && raw.priority !== null
      ? String(raw.priority.label ?? '').toLowerCase()
      : String(raw.priority ?? '').toLowerCase()
  if (label === 'low') return 'low'
  if (label === 'normal') return 'normal'
  if (label === 'high') return 'high'
  if (label === 'urgent') return 'urgent'
  return undefined
}

function mapChannel(c: string | undefined): Channel {
  switch ((c ?? '').toUpperCase()) {
    case 'MAIL':
      return 'email'
    case 'MESSENGER':
      return 'chat'
    case 'TWITTER':
    case 'FACEBOOK':
      return 'social'
    case 'HELPCENTER':
      return 'web'
    case 'NOTE':
      return 'other'
    default:
      return 'other'
  }
}

function mapRating(raw: RawKayakoCase): number | undefined {
  const r = String(raw.rating ?? '').toUpperCase()
  if (r === 'GOOD') return 5
  if (r === 'BAD') return 1
  return undefined
}

export function transformTicket(raw: RawKayakoCase): Ticket {
  const status = mapStatus(raw)
  return {
    id: String(raw.id),
    externalId: String(raw.legacy_id ?? raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw),
    channel: mapChannel(raw.source_channel),
    requesterId: raw.requester?.id ? String(raw.requester.id) : '',
    assigneeId: raw.assigned_agent?.id ? String(raw.assigned_agent.id) : undefined,
    teamId: raw.assigned_team?.id ? String(raw.assigned_team.id) : undefined,
    tagIds: (raw.tags ?? []).map((t) => pickStr(t.name) ?? String(t.id ?? '')).filter(Boolean),
    satisfactionRating: mapRating(raw),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.updated_at) : undefined,
    platform: 'kayako',
    metadata: strMap({ sourceChannel: raw.source_channel, state: raw.state }),
    raw,
  }
}
