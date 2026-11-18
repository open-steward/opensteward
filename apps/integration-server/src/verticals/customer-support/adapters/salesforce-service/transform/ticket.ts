/**
 * Case → Ticket.
 *
 * Fields from the Case object reference
 * (https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_case.htm)
 * and the audit fields every object carries (System Fields,
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/system_fields.htm).
 *
 * `Owner.Type` is the polymorphic Type qualifier ("If you'd like to know the
 * type of object returned in a query, use Who.Type"): Case.OwnerId "Refers To
 * Group, User", so a User owner is the assignee and any other owner is a
 * Group (a queue), the team. Only `User` is compared: the docs name the
 * object types ("TYPEOF Owner WHEN User ... WHEN Group") but do not list the
 * strings Type returns for a queue owner, so the team side does not depend on
 * one.
 * https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_relationships_and_polymorph_keys.htm
 */
import type { Ticket, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export const CASE_FIELDS = [
  'Id',
  'CaseNumber',
  'Subject',
  'Status',
  'IsClosed',
  'ClosedDate',
  'Priority',
  'Origin',
  'ContactId',
  'AccountId',
  'OwnerId',
  'Owner.Type',
  'ParentId',
  'CreatedDate',
  'LastModifiedDate',
] as const

export interface RawSalesforceCase {
  attributes?: { type?: string; url?: string }
  Id: string
  CaseNumber?: string | null
  Subject?: string | null
  Status?: string | null
  IsClosed?: boolean | null
  ClosedDate?: string | null
  Priority?: string | null
  Origin?: string | null
  ContactId?: string | null
  AccountId?: string | null
  OwnerId?: string | null
  Owner?: { Type?: string | null } | null
  ParentId?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
}

/**
 * Priority is a picklist, "such as High, Medium, or Low". Values an org added
 * itself have no canonical equivalent and are left unset (raw value kept in
 * metadata).
 */
function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  switch (p?.toLowerCase()) {
    case 'low':
      return 'low'
    case 'medium':
      return 'normal'
    case 'high':
      return 'high'
    default:
      return undefined
  }
}

/** Origin is "The source of the case, such as Email, Phone, or Web". */
function mapChannel(o: string | null | undefined): Channel {
  switch (o?.toLowerCase()) {
    case 'email':
      return 'email'
    case 'phone':
      return 'voice'
    case 'web':
      return 'web'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawSalesforceCase): Ticket {
  // Status is an org-defined picklist that "directly controls the IsClosed
  // flag"; IsClosed "Indicates whether the case is closed (true) or open
  // (false)". The picklist value itself stays in metadata.
  const closed = raw.IsClosed === true
  const ownerType = raw.Owner?.Type ?? undefined
  const ownerId = pickStr(raw.OwnerId)
  return {
    id: raw.Id,
    externalId: raw.Id,
    number: pickStr(raw.CaseNumber),
    subject: pickStr(raw.Subject) ?? '',
    status: closed ? 'closed' : 'open',
    priority: mapPriority(raw.Priority),
    channel: mapChannel(raw.Origin),
    requesterId: pickStr(raw.ContactId) ?? '',
    assigneeId: ownerType === 'User' ? ownerId : undefined,
    teamId: ownerType && ownerType !== 'User' ? ownerId : undefined,
    tagIds: [],
    parentTicketId: pickStr(raw.ParentId),
    createdAt: toIso(raw.CreatedDate) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.LastModifiedDate),
    closedAt: closed ? toIso(raw.ClosedDate) : undefined,
    platform: 'salesforce-service',
    metadata: strMap({
      status: raw.Status,
      priority: raw.Priority,
      origin: raw.Origin,
      accountId: raw.AccountId,
      ownerId,
      ownerType,
    }),
    raw,
  }
}
