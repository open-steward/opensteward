/**
 * Transform between canonical CRM Contact and CAS genesisWorld Address objects.
 *
 * In CAS genesisWorld both person contacts and company accounts are stored as
 * Address objects. A contact is distinguished by GWISCONTACT='true' in the
 * filter expression.  Field naming follows the German-English hybrid convention
 * used in the genesisWorld data model.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface RawCasAddress {
  /** GGUID — primary identifier */
  GWGUID?: string
  Salutation?: string
  /** Given name */
  FirstName?: string
  LastName?: string
  /** E-mail (primary) */
  EMail1?: string
  /** Phone (business) */
  Phone1?: string
  /** Phone (mobile) */
  Phone3?: string
  /** Job title */
  JobTitle?: string
  /** Company the person belongs to */
  Company?: string
  /** GGUID of the linked company address record */
  CompanyGGUID?: string
  /** CAS user GGUID owning this record */
  UserGGUID?: string
  /** Record creation timestamp (ISO 8601) */
  CreateDate?: string
  /** Last-modification timestamp (ISO 8601) */
  UpdateDate?: string
  /** true when this record is a contact person */
  GWISCONTACT?: boolean | string
  /** true when this record is a company */
  GWISCOMPANY?: boolean | string
  [key: string]: unknown
}

export function transformContact(raw: RawCasAddress): Contact {
  const firstName = raw.FirstName ?? undefined
  const lastName = raw.LastName ?? undefined
  const nameParts = [firstName, lastName].filter(Boolean)

  return {
    id: String(raw.GWGUID ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: raw.EMail1 ?? undefined,
    phone: raw.Phone1 ?? undefined,
    mobile: raw.Phone3 ?? undefined,
    title: raw.JobTitle ?? undefined,
    company_id: raw.CompanyGGUID ? String(raw.CompanyGGUID) : undefined,
    owner_id: raw.UserGGUID ? String(raw.UserGGUID) : undefined,
    created_at: toIsoDatetime(raw.CreateDate),
    updated_at: toIsoDatetime(raw.UpdateDate),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    GWISCONTACT: true,
  }
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.EMail1 = data.email
  if (data.phone !== undefined) out.Phone1 = data.phone
  if (data.mobile !== undefined) out.Phone3 = data.mobile
  if (data.title !== undefined) out.JobTitle = data.title
  if (data.company_id !== undefined) out.CompanyGGUID = data.company_id
  if (data.owner_id !== undefined) out.UserGGUID = data.owner_id
  return out
}
