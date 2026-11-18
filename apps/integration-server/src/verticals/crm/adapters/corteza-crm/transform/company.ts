/**
 * Company (Account) transform for Corteza CRM.
 *
 * Field names are those of the `Account` module in Corteza's CRM application
 * (corteza-server provision/700_crm/1100_modules.yaml): AccountName (String,
 * required), Phone, Industry (Select), NumberOfEmployees (Number, precision 0),
 * OwnerId (User), BillingStreet, BillingCity, BillingState, BillingPostalCode
 * and BillingCountry (a Select of country NAMES).
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
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

export { CortezaRecord as RawCortezaAccount }

export function transformCompany(raw: CortezaRecord): Company {
  const sizeRaw = field(raw, 'NumberOfEmployees')
  const size = sizeRaw != null ? Number(sizeRaw) : undefined

  // BillingCountry holds a country name, not the ISO 3166-1 alpha-2 code the
  // canonical address requires, so it stays in metadata only.
  const line1 = field(raw, 'BillingStreet')
  const city = field(raw, 'BillingCity')
  const region = field(raw, 'BillingState')
  const postalCode = field(raw, 'BillingPostalCode')
  const address =
    line1 || city || region || postalCode ? { line1, city, region, postalCode } : undefined

  return {
    id: String(raw.recordID),
    // An empty value is omitted by Corteza, so absent is the empty name.
    name: field(raw, 'AccountName') ?? '',
    phone: field(raw, 'Phone'),
    size: size != null && Number.isInteger(size) && size >= 0 ? size : undefined,
    industry: field(raw, 'Industry'),
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

export function untransformCompany(data: Partial<Company>): CortezaFieldValue[] {
  const values: CortezaFieldValue[] = []
  push(values, 'AccountName', data.name)
  push(values, 'Phone', data.phone)
  push(values, 'Industry', data.industry)
  push(values, 'OwnerId', data.owner_id)
  if (data.size !== undefined) values.push({ name: 'NumberOfEmployees', value: String(data.size) })
  push(values, 'BillingStreet', data.address?.line1)
  push(values, 'BillingCity', data.address?.city)
  push(values, 'BillingState', data.address?.region)
  push(values, 'BillingPostalCode', data.address?.postalCode)
  push(values, 'BillingCountry', data.address?.country)
  return values
}
