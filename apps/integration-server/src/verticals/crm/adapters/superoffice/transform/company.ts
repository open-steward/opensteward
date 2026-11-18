import type { Company } from '../../../schema/company'
import { firstElementValue, positiveId, primaryKey, requireId, text, utcTimestamp } from '../values'

/**
 * In SuperOffice a "Contact" is a company. GET /api/v1/Contact/{id} returns
 * SuperOffice.CRM.Services.ContactEntity (openapi-v3-Contact.json). Fields read:
 *   ContactId "Primary key", Name "Contact name",
 *   Phones "The contact's phone numbers" (EntityElement, Value),
 *   Domains "Web domains for this contact, ordered in array by rank",
 *   Associate (AssociateId "Primary key"),
 *   CreatedDate "Date registered in UTC.", UpdatedDate "Date last updated in UTC."
 */
export interface RawSuperofficeCompany {
  ContactId?: number
  Name?: string
  Phones?: { Value?: string }[]
  Domains?: string[]
  Associate?: { AssociateId?: number } | null
  CreatedDate?: string
  UpdatedDate?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSuperofficeCompany): Company {
  const id = requireId(raw.ContactId, 'contact')
  if (typeof raw.Name !== 'string') throw new Error(`SuperOffice contact ${id} has no Name`)
  return {
    id,
    name: raw.Name,
    phone: firstElementValue(raw.Phones),
    domain: Array.isArray(raw.Domains) ? text(raw.Domains[0]) : undefined,
    owner_id: positiveId(raw.Associate?.AssociateId),
    created_at: utcTimestamp(raw.CreatedDate),
    updated_at: utcTimestamp(raw.UpdatedDate),
    metadata: raw,
  }
}

/**
 * The columns GET /api/v1/Contact selects. That operation "Calls the Archive
 * service using the "SimpleContact" archive."; its columns, from
 * https://docs.superoffice.com/en/api/archive-providers/reference/simplecontact:
 *   name           stringorPK "Company name"
 *   registeredDate date "Registered date: The date/time the data was registered in UTC."
 *   updatedDate    date "Updated: The date/time the data was last updated in UTC."
 */
export const CONTACT_COLUMNS = ['name', 'registeredDate', 'updatedDate'] as const

export function transformCompanyRow(row: Record<string, unknown>): Company {
  const id = primaryKey(row, 'contact')
  const name = text(row['name'])
  if (name === undefined) throw new Error(`SuperOffice contact row ${id} has no name`)
  return {
    id,
    name,
    created_at: utcTimestamp(row['registeredDate']),
    updated_at: utcTimestamp(row['updatedDate']),
    metadata: row,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Name = data.name
  if (data.phone !== undefined) out.Phone = { Value: data.phone }
  return out
}
