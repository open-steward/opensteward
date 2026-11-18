/**
 * Transform Pega CRM contact data page records to canonical Contact.
 *
 * Pega Sales Automation stores contacts in the PegaCRM-Entity-Contact class.
 * Records are retrieved via the D_crmContactList and D_crmContact data pages.
 *
 * Key fields:
 *   pyID           — platform contact identifier (primary key in data pages)
 *   pyGUID         — global unique identifier (used for case lookups)
 *   FirstName      — given name
 *   LastName       — family name
 *   WorkEmail      — primary email
 *   OfficePhone    — office phone number
 *   MobilePhone    — mobile phone
 *   JobTitle       — job title
 *   AccountID      — linked account (company) identifier
 *   TerritoryID    — sales territory identifier
 *   pxCreateDateTime — ISO 8601 creation timestamp
 *   pxUpdateDateTime — ISO 8601 last-updated timestamp
 */

import type { Contact } from '../../../schema/contact'
import { parsePegaDatetime } from '../utils'

export interface RawPegaContact {
  pyID?: string
  pyGUID?: string
  FirstName?: string
  LastName?: string
  Name?: string
  WorkEmail?: string
  HomeEmail?: string
  OfficePhone?: string
  MobilePhone?: string
  JobTitle?: string
  AccountID?: string
  TerritoryID?: string
  IsCustomer?: boolean | string
  pxCreateDateTime?: string
  pxUpdateDateTime?: string
  pxObjClass?: string
  [key: string]: unknown
}

export function transformContact(raw: RawPegaContact): Contact {
  const firstName = raw.FirstName ?? undefined
  const lastName = raw.LastName ?? undefined
  const fullName =
    raw.Name ??
    ([firstName, lastName].filter(Boolean).join(' ') || undefined)

  return {
    id: String(raw.pyID ?? raw.pyGUID ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.WorkEmail ?? raw.HomeEmail ?? undefined,
    phone: raw.OfficePhone ?? undefined,
    mobile: raw.MobilePhone ?? undefined,
    title: raw.JobTitle ?? undefined,
    company_id: raw.AccountID ? String(raw.AccountID) : undefined,
    created_at: parsePegaDatetime(raw.pxCreateDateTime),
    updated_at: parsePegaDatetime(raw.pxUpdateDateTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.WorkEmail = data.email
  if (data.phone !== undefined) out.OfficePhone = data.phone
  if (data.mobile !== undefined) out.MobilePhone = data.mobile
  if (data.title !== undefined) out.JobTitle = data.title
  if (data.company_id !== undefined) out.AccountID = data.company_id
  return { content: out }
}
