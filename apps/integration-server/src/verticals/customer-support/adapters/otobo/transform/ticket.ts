/**
 * OTOBO ticket transform.
 *
 * Fields are the ones documented for the TicketGet operation in
 * Kernel/GenericInterface/Operation/Ticket/TicketGet.pm (rel-11_0), e.g.
 *   TicketNumber => '20101027000001', Title => 'some title', TicketID => 123,
 *   StateType => 'some state type', Priority => 'some priority',
 *   Created => '2010-10-27 20:15:00', Changed => '2010-10-27 20:15:15'
 *
 * Status maps from StateType, whose values are fixed (TicketSearch.pm: "real
 * state types like new, open, closed, pending reminder, pending auto, removed
 * and merged"); state NAMES are tenant-configurable. Priority maps from the
 * five default priority names in scripts/database/otobo-initial_insert.xml
 * ('1 very low' … '5 very high'); any other name is 'unknown'.
 *
 * TicketGet documents no channel field on a ticket, so channel is 'unknown'.
 * It documents no close or resolve time either, so resolvedAt/closedAt are
 * left out rather than guessed from Changed.
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { parseOtoboDateTime, pickStr, strMap } from './shared'

export interface RawOtoboTicket {
  TicketID: number | string
  TicketNumber?: string
  Title?: string
  State?: string
  StateID?: number | string
  StateType?: string
  Priority?: string
  PriorityID?: number | string
  Queue?: string
  QueueID?: number | string | null
  CustomerUserID?: string | null
  CustomerID?: string | null
  OwnerID?: number | string | null
  Owner?: string | null
  ResponsibleID?: number | string | null
  Responsible?: string | null
  Type?: string | null
  Lock?: string | null
  Created?: string
  Changed?: string
  /** Present only when TicketGet is called with AllArticles=1. */
  Article?: unknown[]
  [key: string]: unknown
}

const STATUS_BY_STATE_TYPE: Record<string, TicketStatus> = {
  new: 'open',
  open: 'open',
  'pending reminder': 'pending',
  'pending auto': 'pending',
  closed: 'closed',
  removed: 'closed',
  merged: 'closed',
}

const PRIORITY_BY_DEFAULT_NAME: Record<string, TicketPriority> = {
  '1 very low': 'low',
  '2 low': 'low',
  '3 normal': 'normal',
  '4 high': 'high',
  '5 very high': 'urgent',
}

function mapStatus(stateType: string | undefined): TicketStatus {
  return (stateType && STATUS_BY_STATE_TYPE[stateType]) || 'unknown'
}

function mapPriority(priority: string | undefined): TicketPriority | undefined {
  if (!priority) return undefined
  return PRIORITY_BY_DEFAULT_NAME[priority] ?? 'unknown'
}

export function transformTicket(raw: RawOtoboTicket): Ticket {
  const createdAt = parseOtoboDateTime(raw.Created)
  if (!createdAt) {
    throw new Error(`otobo ticket ${String(raw.TicketID)} has no parseable Created timestamp`)
  }

  return {
    id: String(raw.TicketID),
    externalId: String(raw.TicketID),
    number: pickStr(raw.TicketNumber),
    subject: pickStr(raw.Title) ?? '',
    status: mapStatus(raw.StateType),
    priority: mapPriority(raw.Priority),
    channel: 'unknown',
    requesterId: pickStr(raw.CustomerUserID) ?? '',
    assigneeId: raw.OwnerID != null ? String(raw.OwnerID) : undefined,
    teamId: raw.QueueID != null ? String(raw.QueueID) : undefined,
    tagIds: [],
    createdAt,
    updatedAt: parseOtoboDateTime(raw.Changed),
    platform: 'otobo',
    metadata: strMap({
      queue: raw.Queue,
      state: raw.State,
      stateType: raw.StateType,
      priority: raw.Priority,
      type: raw.Type,
      lock: raw.Lock,
      owner: raw.Owner,
      responsible: raw.Responsible,
      customerID: raw.CustomerID,
    }),
    raw,
  }
}
