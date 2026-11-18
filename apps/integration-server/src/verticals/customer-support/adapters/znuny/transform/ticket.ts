/**
 * Znuny TicketGet response → canonical Ticket.
 *
 * Znuny ticket fields (snake_case on the wire, as returned by TicketGet):
 *   TicketID, TicketNumber, Title, State, StateType, Priority,
 *   Queue, QueueID, CustomerUserID, OwnerID, Created, Changed, Type
 *
 * Docs:
 *   https://doc.znuny.org/znuny-dev-api/API/Kernel/GenericInterface/Operation/Ticket/TicketGet.html
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZnunyTicket {
  /** Znuny internal numeric ID */
  TicketID: string | number
  /** Human-readable ticket number (e.g. "2023121600001234") */
  TicketNumber?: string
  Title?: string
  /** State string: "new", "open", "pending reminder", "pending auto close+", "closed successful", etc. */
  State?: string
  /** "open", "closed", "pending", "new" */
  StateType?: string
  /** Priority string: "1 very low", "2 low", "3 normal", "4 high", "5 very high" */
  Priority?: string
  Queue?: string
  QueueID?: string | number
  /** CustomerUserID = contact login/email */
  CustomerUserID?: string
  CustomerID?: string
  /** OwnerID is the assigned agent's user ID */
  OwnerID?: string | number
  Owner?: string
  /** Article array — only present when AllArticles=1 passed to TicketGet */
  Article?: RawZnunyArticle[]
  /** ISO-style datetime: "2023-12-16 10:00:00" */
  Created?: string
  Changed?: string
  /** Ticket type (normal, change, incident, etc.) */
  Type?: string
  [key: string]: unknown
}

export interface RawZnunyArticle {
  ArticleID: string | number
  Subject?: string
  Body?: string
  From?: string
  To?: string
  /** "email-external" | "email-internal" | "chat-external" | "phone" | etc. */
  CommunicationChannel?: string
  /** 1 = visible to customer, 0 = internal */
  IsVisibleForCustomer?: number | string
  SenderType?: string
  ContentType?: string
  Created?: string
  CreateBy?: string | number
  Attachment?: Array<{ Filename?: string }>
  [key: string]: unknown
}

function mapStatus(state: string | undefined, stateType: string | undefined): TicketStatus {
  const st = (stateType ?? '').toLowerCase()
  const s = (state ?? '').toLowerCase()
  if (st === 'new' || s === 'new') return 'open'
  if (st === 'open' || s === 'open') return 'open'
  if (st === 'pending' || s.startsWith('pending')) return 'pending'
  if (st === 'closed' || s.startsWith('closed')) return 'closed'
  if (s === 'merged' || s === 'removed') return 'closed'
  return 'open'
}

function mapPriority(p: string | undefined): TicketPriority | undefined {
  if (!p) return undefined
  const lower = p.toLowerCase()
  if (lower.includes('very low') || lower.startsWith('1')) return 'low'
  if (lower.includes('low') || lower.startsWith('2')) return 'low'
  if (lower.includes('normal') || lower.startsWith('3')) return 'normal'
  if (lower.includes('high') && !lower.includes('very') || lower.startsWith('4')) return 'high'
  if (lower.includes('very high') || lower.startsWith('5')) return 'urgent'
  return undefined
}

function mapChannel(channel: string | undefined): Channel {
  if (!channel) return 'other'
  const lower = channel.toLowerCase()
  if (lower.includes('email')) return 'email'
  if (lower.includes('chat')) return 'chat'
  if (lower.includes('phone') || lower.includes('voice')) return 'voice'
  if (lower.includes('web')) return 'web'
  if (lower.includes('sms')) return 'sms'
  if (lower.includes('api')) return 'api'
  return 'other'
}

export function transformTicket(raw: RawZnunyTicket): Ticket {
  const status = mapStatus(raw.State, raw.StateType)

  // Znuny datetimes come as "YYYY-MM-DD HH:MM:SS" — normalize to ISO-8601
  const createdAt = toIso(raw.Created) ?? new Date(0).toISOString()
  const updatedAt = toIso(raw.Changed)
  const resolvedAt = (status === 'resolved' || status === 'closed') ? updatedAt : undefined

  return {
    id: String(raw.TicketID),
    externalId: String(raw.TicketID),
    number: pickStr(raw.TicketNumber) ?? String(raw.TicketID),
    subject: pickStr(raw.Title) ?? '',
    status,
    priority: mapPriority(raw.Priority),
    channel: mapChannel(raw.Type),
    requesterId: pickStr(raw.CustomerUserID) ?? pickStr(raw.CustomerID) ?? '',
    assigneeId: raw.OwnerID ? String(raw.OwnerID) : undefined,
    teamId: raw.QueueID ? String(raw.QueueID) : undefined,
    tagIds: [],
    createdAt,
    updatedAt,
    resolvedAt,
    platform: 'znuny',
    metadata: strMap({
      queue: raw.Queue,
      state: raw.State,
      stateType: raw.StateType,
      type: raw.Type,
      owner: raw.Owner,
      customerID: raw.CustomerID,
    }),
    raw,
  }
}
