import type { Contact } from '../../../schema/contact'
import {
  address,
  entityId,
  main,
  refId,
  str,
  type TeamworkAddressFields,
  type TeamworkEmailAddress,
  type TeamworkPhoneNumber,
  type TeamworkRef,
} from '../raw'

/**
 * The Contact model of `GET /contacts.json` (`contacts[]`) and
 * `GET /contacts/{id}.json` (`contact`), documented fields only
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/contacts/get-contactsjson).
 */
export interface RawTeamworkContact extends TeamworkAddressFields {
  id: number
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  emailAddresses?: TeamworkEmailAddress[] | null
  phoneNumbers?: TeamworkPhoneNumber[] | null
  company?: TeamworkRef | null
  owner?: TeamworkRef | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawTeamworkContact): Contact {
  const firstName = str(raw.firstName)
  const lastName = str(raw.lastName)
  return {
    id: entityId(raw, 'contact'),
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    email: str(main(raw.emailAddresses)?.address),
    // "The phone number, excluding the country code (this can be specified with `code`)."
    phone: str(main(raw.phoneNumbers)?.number),
    // The model's `title` is documented only as {"type":"string"}: nothing says
    // it is a job title rather than a salutation, so it stays in metadata.
    company_id: refId(raw.company),
    owner_id: refId(raw.owner),
    address: address(raw),
    created_at: str(raw.createdAt),
    updated_at: str(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobilePhone = data.mobile
  if (data.company_id !== undefined) out.companyId = data.company_id
  return out
}
