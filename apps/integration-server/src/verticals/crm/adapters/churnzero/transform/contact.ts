/**
 * ChurnZero Contact ↔ canonical Contact transform.
 *
 * ChurnZero Contact fields from the REST API (OData v4):
 *   Id, AccountId, CrmId, Email, ExternalId, FirstName, FullName, LastName,
 *   MarketingEmailUnsubscribed, Name, ObjectCreatedDate, ObjectLastModifiedDate, Tags
 *
 * The internal `Id` is used as the canonical identifier.
 * Composite key on the wire: AccountExternalId + ContactExternalId.
 */
import type { Contact } from '../../../schema/contact'

export interface RawChurnZeroContact {
  Id?: string | number
  ExternalId?: string
  AccountId?: string | number
  CrmId?: string
  Email?: string
  FirstName?: string
  LastName?: string
  FullName?: string
  Name?: string
  MarketingEmailUnsubscribed?: boolean
  Tags?: string[]
  ObjectCreatedDate?: string
  ObjectLastModifiedDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawChurnZeroContact): Contact {
  const id = raw.Id != null ? String(raw.Id) : (raw.ExternalId ?? '')
  const firstName = raw.FirstName ?? undefined
  const lastName = raw.LastName ?? undefined
  const displayName =
    raw.FullName ??
    raw.Name ??
    (firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : undefined)
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    name: displayName,
    email: raw.Email ?? undefined,
    company_id: raw.AccountId != null ? String(raw.AccountId) : undefined,
    tags: Array.isArray(raw.Tags) && raw.Tags.length > 0 ? raw.Tags : undefined,
    created_at: raw.ObjectCreatedDate ?? undefined,
    updated_at: raw.ObjectLastModifiedDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['FirstName'] = data.first_name
  if (data.last_name !== undefined) out['LastName'] = data.last_name
  if (data.email !== undefined) out['Email'] = data.email
  return out
}
