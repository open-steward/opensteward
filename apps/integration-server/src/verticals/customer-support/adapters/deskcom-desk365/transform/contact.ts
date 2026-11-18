/**
 * Desk365 contact transform.
 *
 * Source: ContactResponseModel in the Desk365 v3 OpenAPI spec
 * (https://apps.desk365.io/apis/v3/api-docs?group=v3). GET /v3/contacts
 * returns `{ count, content: ContactResponseModel[] }`; GET
 * /v3/contacts/details returns one ContactResponseModel.
 *
 * The spec documents no contact id. A contact is looked up by
 * `primary_email` ("The primary email address of the contact."), so that is
 * the canonical id. `mobile` is left out (schema firewall: no contact PII
 * beyond email, name and phone).
 *
 * `is_deleted` ("Indicates whether the contact is deleted or not") is kept
 * in metadata as the vendor sends it. GET /v3/contacts documents no filter
 * for it, and dropping rows here would break the fixed 30-row offset paging,
 * so callers see the flag instead.
 *
 * The spec marks no field required. A contact without `name` gets '' (the
 * canonical field is a required string), the same convention as the
 * vertical's reference adapter; nothing else is substituted.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawDesk365Contact {
  name?: string | null
  primary_email?: string | null
  is_deleted?: number | null
  secondary_emails?: string | null
  title?: string | null
  mobile?: string | null
  phone?: string | null
  company_name?: string | null
  primary_department?: string | null
  secondary_departments?: string | null
  created_on?: string | null
  updated_on?: string | null
  custom_fields?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformContact(raw: RawDesk365Contact): Contact {
  const id = pickStr(raw.primary_email)
  if (!id) throw new Error('deskcom-desk365: contact has no primary_email, its only documented key')

  return {
    id,
    externalId: id,
    email: id,
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    organizationId: pickStr(raw.company_name),
    platform: 'deskcom-desk365',
    metadata: strMap({
      title: raw.title,
      primaryDepartment: raw.primary_department,
      isDeleted: raw.is_deleted,
    }),
    raw,
  }
}
