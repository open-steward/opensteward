/**
 * Supportbench case → canonical Ticket transform.
 *
 * Supportbench calls tickets "cases". The case object uses:
 *   id_prefix (string prefix like "C"), id (string case ID), subject,
 *   status / status_id, priority / priority_id, owner_id / owner,
 *   contact_id / contact, company_id / company, division_id / division,
 *   tags (string[]), sat_score (numeric 1-10), nps_score,
 *   created / modified / closed (ISO 8601 datetime strings).
 *
 * Docs: https://supportbench.readme.io/reference/properties.md
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawSupportbenchCase {
  id_prefix?: string | null
  id?: string | null
  division_id?: number | string | null
  division?: string | null
  status_id?: number | string | null
  status?: string | null
  owner_id?: string | null
  owner?: string | null
  priority_id?: string | null
  priority?: string | null
  priority_color?: string | null
  issue_id?: string | null
  issue?: string | null
  asset_id?: string | null
  asset?: string | null
  company_id?: string | null
  company?: string | null
  contact_id?: string | null
  contact?: string | null
  email?: string | null
  subject?: string | null
  summary?: string | null
  tags?: string[]
  sla_target?: string | null
  sla_target_unix?: number | null
  sla_target_readable?: string | null
  support_level?: string | null
  sat_score?: number | null
  nps_score?: number | null
  outcome?: string | null
  queue?: string | null
  fields?: Array<{ name?: string; value?: unknown }>
  activities?: unknown[]
  created?: string | null
  modified?: string | null
  closed?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  if (!s) return 'open'
  const lower = s.toLowerCase()
  if (lower === 'open' || lower === 'new') return 'open'
  if (lower === 'pending') return 'pending'
  if (lower === 'on hold' || lower === 'on_hold' || lower === 'hold') return 'on_hold'
  if (lower === 'resolved' || lower === 'solved') return 'resolved'
  if (lower === 'closed') return 'closed'
  return 'open'
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (!p) return undefined
  const lower = p.toLowerCase()
  if (lower === 'low') return 'low'
  if (lower === 'normal' || lower === 'medium') return 'normal'
  if (lower === 'high') return 'high'
  if (lower === 'urgent' || lower === 'critical') return 'urgent'
  return undefined
}

// Supportbench does not expose a channel field directly on cases; default to 'other'
function mapChannel(): Channel {
  return 'other'
}

function mapSatScore(raw: RawSupportbenchCase): number | undefined {
  // sat_score is 1-10 on Supportbench; normalise to 1-5
  const n = pickNum(raw.sat_score)
  if (n === undefined) return undefined
  return Math.max(1, Math.min(5, Math.round(n / 2)))
}

export function transformTicket(raw: RawSupportbenchCase): Ticket {
  // Build the canonical ID from id_prefix + id (e.g. "C-1042") or just id
  const rawId = pickStr(raw.id) ?? ''
  const id = raw.id_prefix ? `${raw.id_prefix}-${rawId}` : rawId
  const status = mapStatus(raw.status)

  return {
    id,
    externalId: id,
    number: rawId,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(),
    requesterId: pickStr(raw.contact_id) ?? '',
    assigneeId: pickStr(raw.owner_id) ?? undefined,
    teamId: raw.division_id ? String(raw.division_id) : undefined,
    tagIds: raw.tags ?? [],
    satisfactionRating: mapSatScore(raw),
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.modified),
    resolvedAt: status === 'resolved' || status === 'closed' ? (toIso(raw.closed) ?? toIso(raw.modified)) : undefined,
    closedAt: toIso(raw.closed),
    platform: 'supportbench',
    metadata: strMap({
      rawStatus: raw.status,
      rawPriority: raw.priority,
      division: raw.division,
      company: raw.company,
      issue: raw.issue,
      queue: raw.queue,
      support_level: raw.support_level,
      sla_target: raw.sla_target_readable,
    }),
    raw,
  }
}
