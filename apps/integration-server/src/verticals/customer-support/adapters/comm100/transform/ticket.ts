/**
 * Comm100 tickets → canonical Tickets.
 *
 * https://developer.comm100.com/docs/server-api-ticketing-ticket, Ticket JSON
 * Format:
 *   id "Auto Increment Id of the ticket"; subject;
 *   status "Allowed values are "new", "pendingInternal", "pendingExternal",
 *     "onHold", "resolved"";
 *   priority "Allowed values are "urgent", "high", "normal", "low"";
 *   assigneeId "Id of agent or chatbot that the ticket is assigned to", with
 *     assigneeType "Allowed values are "agent", "chatbot"";
 *   departmentAssigneeId; contactOrVisitorId "Id of the contact or visitor
 *     that the ticket related to"; tagIds; createdTime; lastUpdatedTime;
 *   resolvedTime "Resloved time of the ticket"; channelId "Id of the channel
 *     of the first message of the ticket".
 *
 * channelId is an id (a GUID in every example), not a channel name, and no
 * page maps it to one, so `channel` is 'unknown' and the id goes to metadata.
 */
import type { Ticket, TicketStatus, TicketPriority } from '../../../schema'
import { pickStr, required, strMap, toIso } from './shared'

export interface RawComm100Ticket {
  id?: number | string
  subject?: string
  status?: string
  priority?: string
  assigneeId?: string
  assigneeType?: string
  departmentAssigneeId?: string
  contactOrVisitorId?: string
  contactOrVisitorType?: string
  channelId?: string
  tagIds?: string[] | null
  createdTime?: string
  lastUpdatedTime?: string
  resolvedTime?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'new':
    case 'pendingInternal':
      return 'open'
    case 'pendingExternal':
      return 'pending'
    case 'onHold':
      return 'on_hold'
    case 'resolved':
      return 'resolved'
    default:
      return 'unknown'
  }
}

function mapPriority(p: string | undefined): TicketPriority | undefined {
  switch (p) {
    case 'low':
    case 'normal':
    case 'high':
    case 'urgent':
      return p
    default:
      return undefined
  }
}

export function transformTicket(raw: RawComm100Ticket): Ticket {
  const id = required(pickStr(raw.id), 'ticket id')
  const status = mapStatus(raw.status)
  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: 'unknown',
    requesterId: required(pickStr(raw.contactOrVisitorId), `ticket ${id} contactOrVisitorId`),
    // A chatbot assignee is not a user the users list can return.
    assigneeId: raw.assigneeType === 'agent' ? pickStr(raw.assigneeId) : undefined,
    teamId: pickStr(raw.departmentAssigneeId),
    tagIds: Array.isArray(raw.tagIds) ? raw.tagIds.map(String) : [],
    createdAt: required(toIso(raw.createdTime), `ticket ${id} createdTime`),
    updatedAt: toIso(raw.lastUpdatedTime),
    resolvedAt: status === 'resolved' ? toIso(raw.resolvedTime) : undefined,
    platform: 'comm100',
    metadata: strMap({
      comm100Status: raw.status,
      channelId: raw.channelId,
      contactOrVisitorType: raw.contactOrVisitorType,
      assigneeType: raw.assigneeType,
    }),
    raw,
  }
}
