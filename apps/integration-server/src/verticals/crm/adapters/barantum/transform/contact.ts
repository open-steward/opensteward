import type { Contact } from '../../../schema/contact'
import type { Address } from '../../../schema/shared'
import { requireUuid, text } from './fields'

/**
 * A row of the Contacts module, as `POST /api/get_list_data` with
 * `"module": "Contacts"` returns it in `result.content[]`.
 *
 * Docs: https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5
 * ("[Contacts] Get Data", Expected Response). Only the fields this transform
 * reads are typed; the rest stay in `metadata`.
 *
 * Not mapped, on purpose:
 *   - `date_created` / `date_modified` ("2025-09-10 19:02:34") carry no zone,
 *     and the docs name none, so they cannot become ISO instants.
 *   - `contacts_owner` is the owner's NAME ("Name of the contact owner"), not
 *     a user id.
 *   - `contacts_address_country`: the docs show only null, so its format is
 *     unknown, and the canonical country is an ISO 3166-1 alpha-2 code.
 */
export interface RawBarantumContact {
  contacts_uuid: string
  contacts_first_name?: string | null
  contacts_last_name?: string | null
  contacts_email?: string | null
  contacts_title?: string | null
  contacts_phone_mobile?: string | null
  contacts_phone_work?: string | null
  contacts_address_street?: string | null
  contacts_address_city?: string | null
  contacts_address_state?: string | null
  contacts_address_postalcode?: string | null
  org_uuid?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawBarantumContact): Contact {
  const first = text(raw.contacts_first_name)
  const last = text(raw.contacts_last_name)
  const name = [first, last].filter((p): p is string => p !== undefined).join(' ')
  const address: Address = {
    line1: text(raw.contacts_address_street),
    city: text(raw.contacts_address_city),
    region: text(raw.contacts_address_state),
    postalCode: text(raw.contacts_address_postalcode),
  }
  const hasAddress = Object.values(address).some((v) => v !== undefined)
  return {
    id: requireUuid(raw, 'contacts_uuid', 'Contacts'),
    first_name: first,
    last_name: last,
    name: name === '' ? undefined : name,
    email: text(raw.contacts_email),
    phone: text(raw.contacts_phone_work),
    mobile: text(raw.contacts_phone_mobile),
    title: text(raw.contacts_title),
    company_id: text(raw.org_uuid),
    address: hasAddress ? address : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.job_title = data.title
  return out
}
