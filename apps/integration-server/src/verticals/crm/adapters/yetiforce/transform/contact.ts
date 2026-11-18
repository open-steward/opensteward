import type { Contact } from '../../../schema/contact'
import { refId, str, wallTimeToIso } from '../dates'

/**
 * A Contacts record's raw data (`x-raw-data: 1`), keyed by field name.
 *
 * Field names are the `fieldname` column of YetiForce's own install schema
 * for the Contacts module (tabid 4), install/install_schema/data.sql in
 * github.com/YetiForceCompany/YetiForceCRM: firstname, lastname, email,
 * phone, mobile, jobtitle, assigned_user_id, createdtime, modifiedtime.
 * `parent_id` ("Member Of") is not mapped: it may point at Accounts, Leads,
 * Vendors, Partners or Competition (vtiger_fieldmodulerel), so it is not a
 * Company.id on its own.
 */
export type RawYetiForceContact = Record<string, unknown>

/** Fields the Contacts list asks for with `x-fields`. */
export const CONTACT_FIELDS = [
  'firstname',
  'lastname',
  'email',
  'phone',
  'mobile',
  'jobtitle',
  'assigned_user_id',
  'createdtime',
  'modifiedtime',
] as const

export function transformContact(
  id: string,
  raw: RawYetiForceContact,
  rawTimeZone: string,
): Contact {
  return {
    id,
    first_name: str(raw['firstname']),
    last_name: str(raw['lastname']),
    email: str(raw['email']),
    phone: str(raw['phone']),
    mobile: str(raw['mobile']),
    title: str(raw['jobtitle']),
    owner_id: refId(raw['assigned_user_id']),
    created_at: wallTimeToIso(raw['createdtime'], rawTimeZone),
    updated_at: wallTimeToIso(raw['modifiedtime'], rawTimeZone),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['firstname'] = data.first_name
  if (data.last_name !== undefined) out['lastname'] = data.last_name
  if (data.email !== undefined) out['email'] = data.email
  if (data.phone !== undefined) out['phone'] = data.phone
  if (data.title !== undefined) out['title'] = data.title
  if (data.company_id !== undefined) out['accountid'] = data.company_id
  return out
}
