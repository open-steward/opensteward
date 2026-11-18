/**
 * Helpshift issue -> canonical Ticket transform.
 *
 * Helpshift calls tickets "issues". Fields read here are those in the sample
 * issue responses at https://developers.helpshift.com/rest-api/scenarios/:
 *   id            — numeric issue ID
 *   title         — subject of the issue
 *   state_data    — { state: string, changed_at: number (ms) }
 *   assignee_id   — agent profile id, or the string "unassigned"
 *   assignee_name — agent display name, or null
 *   author_name / author_email — the requester
 *   created_at    — Unix timestamp in milliseconds
 *   tags          — string[]
 *   app_id, domain
 *
 * No priority or queue field is documented on the issue payload, so neither
 * priority nor teamId is mapped.
 */
import type { Ticket, TicketStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHelpshiftIssue {
  id: number | string
  title?: string
  state_data?: { state?: string; changed_at?: number }
  assignee_id?: string
  assignee_name?: string | null
  author_email?: string
  author_name?: string
  created_at?: number
  tags?: string[]
  app_id?: string
  domain?: string
  messages?: unknown[]
  [key: string]: unknown
}

function mapState(s: string | undefined): TicketStatus {
  switch (s) {
    case 'new':
    case 'new-for-agent':
      return 'open'
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'resolved':
      return 'resolved'
    case 'rejected':
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

export function transformTicket(raw: RawHelpshiftIssue): Ticket {
  const state = raw.state_data?.state
  const status = mapState(state)
  const stateChangedAt = raw.state_data?.changed_at
  const createdAt = toIso(raw.created_at)
  if (createdAt === undefined)
    throw new Error(`Helpshift issue ${String(raw.id)} has no created_at`)
  const assigneeId = pickStr(raw.assignee_id)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.title) ?? '',
    status,
    channel: 'other',
    requesterId: pickStr(raw.author_email) ?? '',
    assigneeId: assigneeId === 'unassigned' ? undefined : assigneeId,
    tagIds: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    satisfactionRating: undefined,
    createdAt,
    updatedAt: stateChangedAt ? toIso(stateChangedAt) : undefined,
    resolvedAt:
      (status === 'resolved' || status === 'closed') && stateChangedAt
        ? toIso(stateChangedAt)
        : undefined,
    closedAt: status === 'closed' && stateChangedAt ? toIso(stateChangedAt) : undefined,
    platform: 'helpshift',
    metadata: strMap({
      appId: raw.app_id,
      domain: raw.domain,
      state,
      assigneeName: raw.assignee_name,
      authorName: raw.author_name,
    }),
    raw,
  }
}
