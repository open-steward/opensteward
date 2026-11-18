import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * One item of GET /crmRestApi/resources/{version}/contacts, reading only the
 * attributes of `contacts-item-response` in Oracle's REST API for Sales and
 * Fusion Service (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-contacts-get.html).
 */
export interface RawOracleCxContact {
  /** "The unique internal identifier of a contact party." */
  PartyId: number | string
  /** "The first name of the person." */
  FirstName?: string | null
  /** "The last name of the person." */
  LastName?: string | null
  /** "The derived name of the contact." */
  ContactName?: string | null
  /** "The e-mail address of the contact point." */
  EmailAddress?: string | null
  /** "The formatted work phone number information." */
  FormattedWorkPhoneNumber?: string | null
  /** "The formatted mobile phone number information." */
  FormattedMobileNumber?: string | null
  /** "The job title of the contact." */
  JobTitle?: string | null
  /** "The unique identifier of sales account that this contact belongs to." */
  AccountPartyId?: number | string | null
  /** "The unique identifier of a valid employee resource who owns and manages the sales account." */
  OwnerPartyId?: number | string | null
  /** "The date and time when the contact record was created." */
  CreationDate?: string | null
  /** "The date and time when the contact was last updated." */
  LastUpdateDate?: string | null
  [key: string]: unknown
}

/** Attributes requested with `fields=`, all named in `contacts-item-response`. */
export const CONTACT_FIELDS = [
  'PartyId',
  'FirstName',
  'LastName',
  'ContactName',
  'EmailAddress',
  'FormattedWorkPhoneNumber',
  'FormattedMobileNumber',
  'JobTitle',
  'AccountPartyId',
  'OwnerPartyId',
  'CreationDate',
  'LastUpdateDate',
].join(',')

function idOf(v: number | string | null | undefined): string | undefined {
  return v != null ? String(v) : undefined
}

export function transformContact(raw: RawOracleCxContact): Contact {
  return {
    id: String(raw.PartyId),
    first_name: raw.FirstName ?? undefined,
    last_name: raw.LastName ?? undefined,
    name: raw.ContactName ?? undefined,
    email: raw.EmailAddress ?? undefined,
    phone: raw.FormattedWorkPhoneNumber ?? undefined,
    mobile: raw.FormattedMobileNumber ?? undefined,
    title: raw.JobTitle ?? undefined,
    company_id: idOf(raw.AccountPartyId),
    owner_id: idOf(raw.OwnerPartyId),
    created_at: toIsoDatetime(raw.CreationDate),
    updated_at: toIsoDatetime(raw.LastUpdateDate),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.PersonFirstName = data.first_name
  if (data.last_name !== undefined) out.PersonLastName = data.last_name
  if (data.email !== undefined) out.EmailAddress = data.email
  if (data.phone !== undefined) out.PhoneNumber = data.phone
  if (data.title !== undefined) out.JobTitle = data.title
  if (data.company_id !== undefined) out.PrimaryAccountPartyId = data.company_id
  if (data.owner_id !== undefined) out.OwnedByPartyId = data.owner_id
  return out
}
