import type { Contact } from '../../../schema/contact'
import { firstElementValue, positiveId, primaryKey, requireId, text, utcTimestamp } from '../values'

/**
 * GET /api/v1/Person/{id} returns SuperOffice.CRM.Services.PersonEntity
 * (openapi-v3-Person.json). Fields read:
 *   PersonId "Primary key", Firstname "First name", Lastname "Last name",
 *   FullName "The person's full name localized to the current culture/country.",
 *   Title "Title", Emails "A collection of the person's emails" (read by
 *   StrippedValue "This is a value that can be parsed and used by systems."),
 *   OfficePhones / MobilePhones "Returns a collection of office / mobile phone
 *   numbers that belong to the contact person." (EntityElement: Value "The
 *   Element FullName. This is a value that is intended to be shown to the user."),
 *   Contact (ContactId "Primary key"), Associate (AssociateId "Primary key"),
 *   CreatedDate "Registered date in UTC.", UpdatedDate "Last updated date in UTC."
 */
export interface RawSuperoffficePerson {
  PersonId?: number
  Firstname?: string
  Lastname?: string
  FullName?: string
  Title?: string
  Emails?: { Value?: string; StrippedValue?: string }[]
  OfficePhones?: { Value?: string }[]
  MobilePhones?: { Value?: string }[]
  Contact?: { ContactId?: number } | null
  Associate?: { AssociateId?: number } | null
  CreatedDate?: string
  UpdatedDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSuperoffficePerson): Contact {
  return {
    id: requireId(raw.PersonId, 'person'),
    first_name: text(raw.Firstname),
    last_name: text(raw.Lastname),
    name: text(raw.FullName),
    title: text(raw.Title),
    // A system-parseable address for the canonical email field, not the display form.
    email: firstElementValue(raw.Emails, 'StrippedValue'),
    phone: firstElementValue(raw.OfficePhones),
    mobile: firstElementValue(raw.MobilePhones),
    company_id: positiveId(raw.Contact?.ContactId),
    owner_id: positiveId(raw.Associate?.AssociateId),
    created_at: utcTimestamp(raw.CreatedDate),
    updated_at: utcTimestamp(raw.UpdatedDate),
    metadata: raw,
  }
}

/**
 * The columns GET /api/v1/Person selects. That operation "Calls the Archive
 * service using the "Person" archive."; its columns, from
 * https://docs.superoffice.com/en/api/archive-providers/reference/person:
 *   firstName  string "First name: Displays the contact's first name"
 *   lastName   string "Last name: Displays the contact's last name"
 *   title      string "Title: Displays the contact's job title"
 *   contactId  int    "Company ID: Database ID of company"
 *   personRegisteredDate date "Registered date: The date/time the data was registered in UTC."
 *   personUpdatedDate    date "Updated: The date/time the data was last updated in UTC."
 */
export const PERSON_COLUMNS = [
  'firstName',
  'lastName',
  'title',
  'contactId',
  'personRegisteredDate',
  'personUpdatedDate',
] as const

export function transformContactRow(row: Record<string, unknown>): Contact {
  return {
    id: primaryKey(row, 'person'),
    first_name: text(row['firstName']),
    last_name: text(row['lastName']),
    title: text(row['title']),
    company_id: positiveId(row['contactId']),
    created_at: utcTimestamp(row['personRegisteredDate']),
    updated_at: utcTimestamp(row['personUpdatedDate']),
    metadata: row,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.Firstname = data.first_name
  if (data.last_name !== undefined) out.Lastname = data.last_name
  if (data.email !== undefined) out.EmailItem = { Value: data.email }
  if (data.phone !== undefined) out.WorkPhone = { Value: data.phone }
  if (data.mobile !== undefined) out.MobilePhone = { Value: data.mobile }
  if (data.company_id !== undefined) out.Contact = { ContactId: Number(data.company_id) }
  return out
}
