/**
 * Vivantio Ticket → canonical Ticket transform.
 *
 * Vivantio tickets use StatusType (integer enum) for status rather than a
 * string.  StatusType values:
 *   0 = Open, 1 = Pending, 2 = Resolved, 3 = Closed, 4 = On Hold
 *
 * Priority and channel are represented by name strings (PriorityName,
 * CallOrigin integer).  CallOrigin:
 *   0 = Unknown, 1 = Phone, 2 = Email, 3 = Web/Portal, 4 = API, 5 = Chat
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawVivantioTicket {
  Id: number
  DisplayId?: string | null
  Title?: string
  Description?: string | null
  StatusId?: number
  StatusName?: string
  StatusType?: number
  PriorityId?: number | null
  PriorityName?: string | null
  CallerId?: number | null
  CallerName?: string | null
  OwnerId?: number | null
  OwnerName?: string | null
  GroupId?: number | null
  GroupName?: string | null
  ClientId?: number | null
  ClientName?: string | null
  RecordTypeId?: number
  RecordTypeNameSingular?: string | null
  OpenDate?: string | null
  CloseDate?: string | null
  ResolvedDate?: string | null
  LastModifiedDate?: string | null
  Resolved?: boolean
  IsDeferred?: boolean
  Deleted?: boolean
  CallOrigin?: number
  ThirdPartyId?: number | null
  ThirdPartyRef?: string | null
  CategoryId?: number | null
  CategoryLineage?: string | null
  [key: string]: unknown
}

function mapStatusType(statusType: number | undefined, statusName: string | undefined): TicketStatus {
  switch (statusType) {
    case 0: return 'open'
    case 1: return 'pending'
    case 2: return 'resolved'
    case 3: return 'closed'
    case 4: return 'on_hold'
    default: break
  }
  // Fallback: parse StatusName
  const s = (statusName ?? '').toLowerCase()
  if (s === 'open' || s === 'new' || s === 'active') return 'open'
  if (s === 'pending' || s.includes('wait')) return 'pending'
  if (s.includes('resolv')) return 'resolved'
  if (s === 'closed' || s.includes('close')) return 'closed'
  if (s.includes('hold') || s.includes('defer')) return 'on_hold'
  return 'open'
}

function mapPriority(name: string | null | undefined): TicketPriority | undefined {
  const p = (name ?? '').toLowerCase()
  if (p === 'low' || p === 'minor') return 'low'
  if (p === 'medium' || p === 'normal' || p === 'moderate') return 'normal'
  if (p === 'high' || p === 'major') return 'high'
  if (p === 'critical' || p === 'urgent' || p === 'emergency') return 'urgent'
  return undefined
}

function mapCallOrigin(origin: number | undefined): Channel {
  switch (origin) {
    case 1: return 'voice'
    case 2: return 'email'
    case 3: return 'web'
    case 4: return 'api'
    case 5: return 'chat'
    default: return 'other'
  }
}

export function transformTicket(raw: RawVivantioTicket): Ticket {
  const status = mapStatusType(raw.StatusType, raw.StatusName)
  return {
    id: String(raw.Id),
    externalId: pickStr(raw.DisplayId) ?? String(raw.Id),
    number: pickStr(raw.DisplayId) ?? String(raw.Id),
    subject: pickStr(raw.Title) ?? '',
    status,
    priority: mapPriority(raw.PriorityName),
    channel: mapCallOrigin(raw.CallOrigin),
    requesterId: raw.CallerId ? String(raw.CallerId) : '',
    assigneeId: raw.OwnerId ? String(raw.OwnerId) : undefined,
    teamId: raw.GroupId ? String(raw.GroupId) : undefined,
    tagIds: [],
    parentTicketId: undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.OpenDate) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.LastModifiedDate),
    resolvedAt:
      status === 'resolved' || status === 'closed'
        ? toIso(raw.ResolvedDate) ?? toIso(raw.CloseDate)
        : undefined,
    platform: 'vivantio',
    metadata: strMap({
      statusName: raw.StatusName,
      priorityName: raw.PriorityName,
      clientId: raw.ClientId,
      clientName: raw.ClientName,
      categoryLineage: raw.CategoryLineage,
      recordType: raw.RecordTypeNameSingular,
      thirdPartyRef: raw.ThirdPartyRef,
    }),
    raw,
  }
}
