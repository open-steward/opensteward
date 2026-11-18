/**
 * SAP Sales Cloud V2 — Individual Customer (Contact) transform.
 *
 * SAP Sales Cloud V2 refers to contacts as "individualCustomers" in the
 * REST API (service: SalesSvcCloudV2_individualCustomerService).
 * Endpoint: GET /sap/c4c/api/v1/individual-customer-service/individualCustomers
 *
 * Key fields:
 *   id               — system UUID
 *   firstName        — given name
 *   lastName         — family name
 *   fullName         — display name (derived by SAP)
 *   emailAddress     — primary email
 *   phone            — primary phone
 *   mobilePhone      — mobile phone
 *   jobTitle         — professional title
 *   accountId        — linked account UUID
 *   ownerId          — assigned owner UUID
 *   createdAt        — ISO-8601 creation timestamp (may lack timezone offset)
 *   lastModifiedAt   — ISO-8601 last-modified timestamp (may lack timezone offset)
 */
import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSapIndividual {
  id: string
  firstName?: string
  lastName?: string
  fullName?: string
  emailAddress?: string
  phone?: string
  mobilePhone?: string
  jobTitle?: string
  accountId?: string
  ownerId?: string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSapIndividual): Contact {
  const derived = [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined
  const fullName = raw.fullName ?? derived

  return {
    id: String(raw.id),
    first_name: raw.firstName ?? undefined,
    last_name: raw.lastName ?? undefined,
    name: fullName,
    email: raw.emailAddress ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobilePhone ?? undefined,
    title: raw.jobTitle ?? undefined,
    company_id: raw.accountId ?? undefined,
    owner_id: raw.ownerId ?? undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.lastModifiedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.emailAddress = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobilePhone = data.mobile
  if (data.title !== undefined) out.jobTitle = data.title
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
