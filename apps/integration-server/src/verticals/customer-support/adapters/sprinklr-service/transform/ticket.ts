/**
 * Transform a Sprinklr case → canonical Ticket.
 *
 * Source: "GET - Read Case by Case Id", `GET /api/v2/case/{caseId}`
 * (https://dev.sprinklr.com/read-case-by-case-id). The documented response is
 * `{ "data": { …case… }, "errors": [] }`; this maps the `data` object, whose
 * documented fields are:
 *   id, caseNumber, subject, description, version,
 *   status ("The state of the case. e.g. Open, Pending, Closed"),
 *   priority ("The Urgency of the case …", example "High"),
 *   caseType, createdTime, modifiedTime,
 *   contact { id, name, channelType },
 *   workflow { assignment { assigneeId, assigneeType, … }, queues [{ queueId, assignmentTime }] }.
 *
 * Values the docs do not name map to the schema's `unknown`, with the raw
 * value kept in metadata; nothing defaults to a real state.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSprinklrCase {
  id?: string
  caseNumber?: number | string
  subject?: string
  description?: string
  status?: string
  priority?: string
  caseType?: string
  contact?: { id?: string; channelType?: string; [key: string]: unknown } | null
  workflow?: {
    assignment?: { assigneeId?: string | number; assigneeType?: string } | null
    queues?: Array<{ queueId?: number | string; assignmentTime?: number }> | null
  } | null
  createdTime?: number
  modifiedTime?: number
  [key: string]: unknown
}

/** Documented states: "e.g. Open, Pending, Closed". */
function mapStatus(s: string | undefined): TicketStatus {
  switch (s?.toUpperCase()) {
    case 'OPEN':
      return 'open'
    case 'PENDING':
      return 'pending'
    case 'CLOSED':
      return 'closed'
    default:
      return 'unknown'
  }
}

/**
 * `priority` is a free string ("The Urgency of the case with which case should
 * be addressed"; the spec's Case_V2.priority has no enum). The only value the
 * docs show is the example's "High"; anything else maps to `unknown`, with
 * the raw value kept in metadata.
 */
function mapPriority(p: string | undefined): TicketPriority | undefined {
  if (!p) return undefined
  return p.toLowerCase() === 'high' ? 'high' : 'unknown'
}

/**
 * `contact.channelType` is a free string (the spec's Contact_V2.channelType
 * has no enum). The only value the docs show is the read-case example's
 * SPRINKLR_VOICE; anything else maps to `unknown`, with the raw value kept in
 * metadata.
 */
function mapChannel(c: string | undefined): Channel {
  return c === 'SPRINKLR_VOICE' ? 'voice' : 'unknown'
}

export function transformTicket(raw: RawSprinklrCase): Ticket {
  const id = pickStr(raw.id)
  if (!id) throw new Error('Sprinklr case has no id')
  const requesterId = pickStr(raw.contact?.id)
  if (!requesterId) throw new Error(`Sprinklr case ${id} has no contact.id`)
  const createdAt = toIso(raw.createdTime)
  if (!createdAt) throw new Error(`Sprinklr case ${id} has no createdTime`)

  const assigneeId = pickStr(raw.workflow?.assignment?.assigneeId)
  const teamId = pickStr(raw.workflow?.queues?.[0]?.queueId)

  return {
    id,
    externalId: id,
    number: pickStr(raw.caseNumber),
    subject: pickStr(raw.subject) ?? '',
    status: mapStatus(raw.status),
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.contact?.channelType),
    requesterId,
    assigneeId,
    teamId,
    tagIds: [],
    createdAt,
    updatedAt: toIso(raw.modifiedTime),
    platform: 'sprinklr-service',
    metadata: strMap({
      caseStatus: raw.status,
      casePriority: raw.priority,
      caseType: raw.caseType,
      channelType: raw.contact?.channelType,
      assigneeType: raw.workflow?.assignment?.assigneeType,
    }),
    raw,
  }
}
