/**
 * Pylon Issue → canonical Ticket transform.
 *
 * Pylon calls them "issues". State values: new, waiting_on_you,
 * waiting_on_customer, on_hold, closed, or custom strings.
 * Source values: slack, microsoft_teams, chat_widget, email, form,
 * discord, whatsapp, sms, telegram, phone, manual.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPylonIssue {
  id: string
  number?: number
  title?: string
  state?: string
  source?: string
  requester?: { id?: string; email?: string } | null
  assignee?: { id?: string; email?: string } | null
  team?: { id?: string } | null
  tags?: string[]
  body_html?: string
  created_at?: string
  updated_at?: string
  resolution_time?: string
  csat_responses?: Array<{ score?: number; comment?: string }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'new':
    case 'waiting_on_you':
    case 'waiting_on_customer':
      return 'open'
    case 'on_hold':
      return 'on_hold'
    case 'closed':
      return 'closed'
    default:
      // Unknown custom status — treat as open
      return 'open'
  }
}

function mapChannel(source: string | undefined): Channel {
  switch (source) {
    case 'email':
      return 'email'
    case 'chat_widget':
    case 'slack':
    case 'microsoft_teams':
    case 'discord':
      return 'chat'
    case 'phone':
      return 'voice'
    case 'whatsapp':
      return 'social'
    case 'sms':
    case 'telegram':
      return 'sms'
    case 'form':
    case 'manual':
      return 'web'
    default:
      return 'other'
  }
}

function mapCsatScore(raw: RawPylonIssue): number | undefined {
  const responses = raw.csat_responses
  if (!responses || responses.length === 0) return undefined
  const last = responses[responses.length - 1]
  if (last?.score == null) return undefined
  // Pylon CSAT scores are typically 1-5
  const n = Number(last.score)
  if (Number.isNaN(n)) return undefined
  return Math.max(1, Math.min(5, Math.round(n)))
}

export function transformTicket(raw: RawPylonIssue): Ticket {
  const status = mapStatus(raw.state)
  const resolvedAt =
    status === 'closed' ? toIso(raw.resolution_time) ?? toIso(raw.updated_at) : undefined
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: raw.number != null ? String(raw.number) : undefined,
    subject: pickStr(raw.title) ?? '',
    status,
    // Pylon does not return priority on list/get responses
    priority: undefined,
    channel: mapChannel(raw.source),
    requesterId: pickStr(raw.requester?.id) ?? '',
    assigneeId: raw.assignee?.id ? pickStr(raw.assignee.id) : undefined,
    teamId: raw.team?.id ? pickStr(raw.team.id) : undefined,
    tagIds: raw.tags ?? [],
    parentTicketId: undefined,
    satisfactionRating: mapCsatScore(raw),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt,
    platform: 'gorgias-aircall',
    metadata: strMap({ state: raw.state, source: raw.source }),
    raw,
  }
}
