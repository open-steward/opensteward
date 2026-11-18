/**
 * Plain thread → canonical Ticket transform.
 *
 * Plain "threads" are the equivalent of tickets in other support platforms.
 * Docs: https://www.plain.com/docs/graphql/threads
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPlainThread {
  id: string
  externalId?: string | null
  title?: string | null
  /** OPEN | SNOOZED | DONE */
  status?: string | null
  /** URGENT | HIGH | NORMAL | LOW */
  priority?: number | null
  customer?: { id?: string | null } | null
  assignee?: { userId?: string | null } | { machineUserId?: string | null } | null
  labels?: Array<{ id?: string | null; labelType?: { id?: string | null; name?: string | null } }> | null
  createdAt?: { iso8601?: string | null } | null
  updatedAt?: { iso8601?: string | null } | null
  resolvedAt?: { iso8601?: string | null } | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN':
      return 'open'
    case 'SNOOZED':
      return 'on_hold'
    case 'DONE':
      return 'resolved'
    default:
      return 'open'
  }
}

/**
 * Plain priority is an integer: 0=URGENT, 1=HIGH, 2=NORMAL, 3=LOW
 */
function mapPriority(p: number | null | undefined): TicketPriority | undefined {
  switch (p) {
    case 0:
      return 'urgent'
    case 1:
      return 'high'
    case 2:
      return 'normal'
    case 3:
      return 'low'
    default:
      return undefined
  }
}

export function transformTicket(raw: RawPlainThread): Ticket {
  const status = mapStatus(raw.status)
  const labelIds = (raw.labels ?? [])
    .map((l) => l?.labelType?.id ?? l?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const createdAt = toIso(raw.createdAt?.iso8601) ?? new Date(0).toISOString()
  const updatedAt = toIso(raw.updatedAt?.iso8601)
  const resolvedAt =
    toIso(raw.resolvedAt?.iso8601) ??
    (status === 'resolved' ? updatedAt : undefined)

  return {
    id: raw.id,
    externalId: pickStr(raw.externalId) ?? raw.id,
    subject: pickStr(raw.title) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: 'other',
    requesterId: pickStr(raw.customer?.id) ?? '',
    assigneeId: raw.assignee != null
      ? pickStr(
          'userId' in raw.assignee ? raw.assignee.userId :
          'machineUserId' in raw.assignee ? raw.assignee.machineUserId :
          undefined
        )
      : undefined,
    tagIds: labelIds,
    createdAt,
    updatedAt,
    resolvedAt,
    platform: 'plain',
    metadata: strMap({ rawStatus: raw.status, rawPriority: raw.priority }),
    raw,
  }
}
