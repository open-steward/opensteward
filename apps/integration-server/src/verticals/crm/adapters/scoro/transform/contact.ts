import type { Contact } from '../../../schema/contact'
import { firstMeans, idOf, isoWithOffset, nonEmpty, requiredId, validEmail } from '../fields'

/**
 * A Scoro contact of contact_type "person". Fields from the Contacts table at
 * https://api.scoro.com/api/v2:
 *
 *   contact_id        Integer   "Contact ID"
 *   name              String    "contact first name or company name"
 *   lastname          String    "contact last name. Used only for persons"
 *   search_name       String    "contact full name. Not used on modify requests."
 *   contact_type      String    "possible values are \"person\" or \"company\"."
 *   position          String    "working position. CEO, manager etc."
 *   manager_id        Integer   "Contact manager ID."
 *   created_date      Datetime  "The date when contact was created."
 *   modified_date     Datetime  "The date when contact was last modified."
 *   means_of_contact  Object    "mobile, phone, email, website, skype, fax"
 *   related_companies Array     "objects containing the related_company_id and
 *                               related_company_name fields. Filled only for
 *                               contacts of type person."
 */
export interface RawScoroContact {
  contact_id?: number | string
  name?: string | null
  lastname?: string | null
  search_name?: string | null
  contact_type?: string
  position?: string | null
  manager_id?: number | string | null
  created_date?: string | null
  modified_date?: string | null
  means_of_contact?: Record<string, unknown> | null
  related_companies?: Array<{
    related_company_id?: number | string
    related_company_name?: string
  }> | null
  [key: string]: unknown
}

export function transformContact(raw: RawScoroContact): Contact {
  const related = Array.isArray(raw.related_companies) ? raw.related_companies[0] : undefined
  return {
    id: requiredId(raw.contact_id, 'contact'),
    first_name: nonEmpty(raw.name),
    last_name: nonEmpty(raw.lastname),
    name: nonEmpty(raw.search_name),
    email: validEmail(firstMeans(raw.means_of_contact, 'email')),
    phone: firstMeans(raw.means_of_contact, 'phone'),
    mobile: firstMeans(raw.means_of_contact, 'mobile'),
    title: nonEmpty(raw.position),
    company_id: idOf(related?.related_company_id),
    owner_id: idOf(raw.manager_id),
    created_at: isoWithOffset(raw.created_date),
    updated_at: isoWithOffset(raw.modified_date),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile_phone = data.mobile
  if (data.company_id !== undefined) out.company_id = data.company_id
  return out
}
