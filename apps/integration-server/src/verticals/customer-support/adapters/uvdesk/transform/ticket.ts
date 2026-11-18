/**
 * UVdesk ticket transform.
 *
 * UVdesk ticket wire shape (GET /{locale}/api/ticket/{id}.json):
 *   id, incrementId, subject, status {id, description}, priority {id, description},
 *   source, isNew, isReplied, isStarred, isTrashed, createdAt, updatedAt,
 *   customer {id, email, name}, agent {id, email, name},
 *   group {id, name}, team {id, name}, tags [{id, name}], totalThreads
 *
 * UVdesk status descriptions: Open, Pending, Answered, Resolved, Closed, Spam
 * UVdesk priority descriptions: Low, Medium, High, Urgent
 * UVdesk source values: email, website, api
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import type { RawUvdeskTag } from './tag'

export interface RawUvdeskTicketStatus {
  id?: number
  description?: string
  [key: string]: unknown
}

export interface RawUvdeskTicketPriority {
  id?: number
  description?: string
  [key: string]: unknown
}

export interface RawUvdeskTicketUser {
  id?: number | string
  email?: string
  name?: string
  [key: string]: unknown
}

export interface RawUvdeskTicket {
  id?: number | string
  incrementId?: number | string
  subject?: string
  status?: RawUvdeskTicketStatus | string
  priority?: RawUvdeskTicketPriority | string
  source?: string
  isNew?: boolean
  isReplied?: boolean
  isStarred?: boolean
  isTrashed?: boolean
  createdAt?: string
  updatedAt?: string
  customer?: RawUvdeskTicketUser | null
  agent?: RawUvdeskTicketUser | null
  group?: { id?: number | string; name?: string } | null
  team?: { id?: number | string; name?: string } | null
  tags?: RawUvdeskTag[]
  totalThreads?: number
  [key: string]: unknown
}

function resolveStatusDescription(status: RawUvdeskTicket['status']): string | undefined {
  if (!status) return undefined
  if (typeof status === 'string') return status
  return pickStr(status.description)
}

function resolvePriorityDescription(priority: RawUvdeskTicket['priority']): string | undefined {
  if (!priority) return undefined
  if (typeof priority === 'string') return priority
  return pickStr(priority.description)
}

function mapStatus(raw: RawUvdeskTicket['status']): TicketStatus {
  const s = resolveStatusDescription(raw)?.toLowerCase()
  switch (s) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'answered':
      return 'in_progress'
    case 'resolved':
      return 'resolved'
    case 'closed':
      return 'closed'
    case 'spam':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(raw: RawUvdeskTicket['priority']): TicketPriority | undefined {
  const p = resolvePriorityDescription(raw)?.toLowerCase()
  if (p === 'low') return 'low'
  if (p === 'medium') return 'normal'
  if (p === 'high') return 'high'
  if (p === 'urgent') return 'urgent'
  return undefined
}

function mapSource(source: string | undefined): Channel {
  switch (source) {
    case 'email':
      return 'email'
    case 'website':
      return 'web'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawUvdeskTicket): Ticket {
  const status = mapStatus(raw.status)
  const tagIds = (raw.tags ?? []).map((t) => String(t.id ?? t.name ?? '')).filter(Boolean)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.incrementId != null ? String(raw.incrementId) : undefined,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapSource(raw.source),
    requesterId: String(raw.customer?.id ?? ''),
    assigneeId: raw.agent?.id != null ? String(raw.agent.id) : undefined,
    teamId: raw.group?.id != null ? String(raw.group.id) : undefined,
    tagIds,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.updatedAt) : undefined,
    platform: 'uvdesk',
    metadata: strMap({
      source: raw.source,
      isNew: raw.isNew,
      isReplied: raw.isReplied,
      isStarred: raw.isStarred,
      totalThreads: raw.totalThreads,
    }),
    raw,
  }
}
