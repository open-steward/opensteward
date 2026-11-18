import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * A HighLevel Business (`BusinessDto`, API Version 2021-07-28), as GET
 * /businesses/ and GET /businesses/:businessId return it. `id`, `name` and
 * `locationId` are required by GoHighLevel's spec
 * (https://raw.githubusercontent.com/GoHighLevel/highlevel-api-docs/main/apps/businesses.json).
 */
export interface RawHighLevelCompany {
  id: string
  name: string
  locationId: string
  phone?: string
  email?: string
  website?: string
  address?: string
  city?: string
  description?: string
  state?: string
  postalCode?: string
  country?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

type Address = NonNullable<Company['address']>

/**
 * The business's postal address. `country` is free text upstream ("united
 * states" in the list example, "us" in the create example), so it is kept only
 * when it is an assigned ISO 3166-1 alpha-2 code; any other value stays in
 * `metadata` rather than being guessed into a code.
 */
function addressOf(raw: RawHighLevelCompany): Address | undefined {
  const address: Address = {}
  if (raw.address) address.line1 = raw.address
  if (raw.city) address.city = raw.city
  if (raw.state) address.region = raw.state
  if (raw.postalCode) address.postalCode = raw.postalCode
  const country = raw.country?.trim().toUpperCase()
  if (country && isIso3166Alpha2(country)) address.country = country
  return Object.keys(address).length > 0 ? address : undefined
}

export function transformCompany(raw: RawHighLevelCompany): Company {
  const company: Company = { id: String(raw.id), name: raw.name, metadata: raw }
  if (raw.website) company.domain = raw.website
  if (raw.phone) company.phone = raw.phone
  const address = addressOf(raw)
  if (address) company.address = address
  if (raw.createdAt) company.created_at = raw.createdAt
  if (raw.updatedAt) company.updated_at = raw.updatedAt
  return company
}

export function untransformCompany(
  data: Partial<Company>,
  locationId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { locationId }
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
