/**
 * Transform Octadesk ticket to canonical Ticket.
 *
 * Octadesk ticket fields (from POST /tickets body + GET /tickets response):
 *   number, summary, description, status{id, name}, channel{id, name},
 *   type{id, name}, requester{id, name, email}, assigned{id, name, email},
 *   group{id, name}, priority{id, name}, tags[], openDate, lastDateUpdate,
 *   slaDueDate, organization{id, name}
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawOctadeskTicketStatus {
  id?: string
  name?: string
  [key: string]: unknown
}

export interface RawOctadeskTicketPriority {
  id?: string
  name?: string
  [key: string]: unknown
}

export interface RawOctadeskTicketChannel {
  id?: string
  name?: string
  [key: string]: unknown
}

export interface RawOctadeskPerson {
  id?: string
  name?: string
  email?: string
  [key: string]: unknown
}

export interface RawOctadeskTicket {
  /** Ticket number (used as identifier in Octadesk) */
  number?: number | string
  /** Short title of the ticket */
  summary?: string
  description?: string
  status?: RawOctadeskTicketStatus
  priority?: RawOctadeskTicketPriority
  channel?: RawOctadeskTicketChannel
  type?: { id?: string; name?: string; [key: string]: unknown }
  requester?: RawOctadeskPerson
  assigned?: RawOctadeskPerson
  group?: { id?: string; name?: string; [key: string]: unknown }
  tags?: string[]
  /** ISO-8601 open/created date */
  openDate?: string
  /** ISO-8601 last update date */
  lastDateUpdate?: string
  /** ISO-8601 SLA due date */
  slaDueDate?: string
  organization?: { id?: string; name?: string; [key: string]: unknown }
  [key: string]: unknown
}

function mapStatus(raw: RawOctadeskTicketStatus | undefined): TicketStatus {
  const name = (raw?.name ?? '').toLowerCase()
  if (name === 'novo' || name === 'new' || name === 'open' || name === 'aberto') return 'open'
  if (name === 'pendente' || name === 'pending') return 'pending'
  if (name === 'em espera' || name === 'on hold' || name === 'onhold') return 'on_hold'
  if (name === 'andamento' || name === 'in progress' || name === 'em andamento') return 'open'
  if (name === 'resolvido' || name === 'resolved' || name === 'solved') return 'resolved'
  if (name === 'fechado' || name === 'closed' || name === 'cancelado' || name === 'rejected' || name === 'rejeitado') return 'closed'
  return 'open'
}

function mapPriority(raw: RawOctadeskTicketPriority | undefined): TicketPriority | undefined {
  const name = (raw?.name ?? '').toLowerCase()
  if (name === 'baixa' || name === 'low') return 'low'
  if (name === 'normal' || name === 'média' || name === 'media' || name === 'medium') return 'normal'
  if (name === 'alta' || name === 'high') return 'high'
  if (name === 'urgente' || name === 'urgent' || name === 'critica' || name === 'crítica' || name === 'critical') return 'urgent'
  return undefined
}

function mapChannel(raw: RawOctadeskTicketChannel | undefined): Channel {
  const name = (raw?.name ?? '').toLowerCase()
  if (name.includes('email')) return 'email'
  if (name.includes('chat') || name.includes('widget') || name.includes('web')) return 'chat'
  if (name.includes('phone') || name.includes('voice') || name.includes('fone') || name.includes('tel')) return 'voice'
  if (name.includes('sms') || name.includes('whatsapp') || name.includes('messenger')) return 'sms'
  if (name.includes('social') || name.includes('facebook') || name.includes('twitter') || name.includes('instagram')) return 'social'
  if (name.includes('api')) return 'api'
  return 'other'
}

export function transformTicket(raw: RawOctadeskTicket): Ticket {
  const id = String(raw.number ?? '')
  const status = mapStatus(raw.status)
  const isResolved = status === 'resolved' || status === 'closed'
  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.summary) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.channel),
    requesterId: raw.requester?.id ? String(raw.requester.id) : '',
    assigneeId: raw.assigned?.id ? String(raw.assigned.id) : undefined,
    teamId: raw.group?.id ? String(raw.group.id) : undefined,
    tagIds: raw.tags ?? [],
    createdAt: toIso(raw.openDate) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.lastDateUpdate),
    resolvedAt: isResolved ? toIso(raw.lastDateUpdate) : undefined,
    platform: 'octadesk',
    metadata: strMap({
      channelName: raw.channel?.name,
      statusName: raw.status?.name,
      priorityName: raw.priority?.name,
      typeName: (raw.type as { name?: string } | undefined)?.name,
      organizationId: raw.organization?.id,
      organizationName: raw.organization?.name,
      slaDueDate: raw.slaDueDate,
    }),
    raw,
  }
}
