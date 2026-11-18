/**
 * Contact transform for Corteza CRM.
 *
 * Field names are those of the `Contact` module in Corteza's CRM application
 * (corteza-server provision/700_crm/1100_modules.yaml): FirstName, LastName,
 * Email, Phone, MobilePhone, Title, AccountId (Record), OwnerId (User),
 * MailingStreet, MailingCity, MailingState, MailingPostalCode and
 * MailingCountry (a Select of country NAMES such as "Afghanistan").
 *
 * Records store values as an array of {name, value} pairs.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import type { CortezaRecord, CortezaFieldValue } from '../client'

/**
 * A record value by field name. Corteza omits `value` when it is empty
 * (record_value.go: `Value string json:"value,omitempty"`), so absent and ''
 * both read as undefined.
 */
function field(record: CortezaRecord, name: string): string | undefined {
  const found = record.values?.find((v) => v.name === name)
  return found?.value !== undefined && found.value !== '' ? found.value : undefined
}

export { CortezaRecord as RawCortezaContact }

export function transformContact(raw: CortezaRecord): Contact {
  const firstName = field(raw, 'FirstName')
  const lastName = field(raw, 'LastName')
  const name = [firstName, lastName].filter(Boolean).join(' ') || undefined

  // MailingCountry holds a country name, not the ISO 3166-1 alpha-2 code the
  // canonical address requires, so it stays in metadata only.
  const line1 = field(raw, 'MailingStreet')
  const city = field(raw, 'MailingCity')
  const region = field(raw, 'MailingState')
  const postalCode = field(raw, 'MailingPostalCode')
  const address =
    line1 || city || region || postalCode ? { line1, city, region, postalCode } : undefined

  return {
    id: String(raw.recordID),
    first_name: firstName,
    last_name: lastName,
    name,
    email: field(raw, 'Email'),
    phone: field(raw, 'Phone'),
    mobile: field(raw, 'MobilePhone'),
    title: field(raw, 'Title'),
    company_id: field(raw, 'AccountId'),
    owner_id: field(raw, 'OwnerId'),
    address,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function push(values: CortezaFieldValue[], name: string, value: string | null | undefined): void {
  if (value != null) values.push({ name, value })
}

export function untransformContact(data: Partial<Contact>): CortezaFieldValue[] {
  const values: CortezaFieldValue[] = []
  push(values, 'FirstName', data.first_name)
  push(values, 'LastName', data.last_name)
  push(values, 'Email', data.email)
  push(values, 'Phone', data.phone)
  push(values, 'MobilePhone', data.mobile)
  push(values, 'Title', data.title)
  push(values, 'AccountId', data.company_id)
  push(values, 'OwnerId', data.owner_id)
  push(values, 'MailingStreet', data.address?.line1)
  push(values, 'MailingCity', data.address?.city)
  push(values, 'MailingState', data.address?.region)
  push(values, 'MailingPostalCode', data.address?.postalCode)
  push(values, 'MailingCountry', data.address?.country)
  return values
}
