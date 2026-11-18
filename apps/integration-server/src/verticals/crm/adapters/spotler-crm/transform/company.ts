import type { Company } from '../../../schema/company'

/**
 * An account `record`, with the fields of the "GET Your Accounts" example on
 * https://support.reallysimplesystems.com/api-v4/. `createddate` and
 * `modifieddate` ("2018-09-17 11:29:59") carry no zone and the page names
 * none, so they stay in `metadata`. `addresscountry` is a country name
 * ("United Kingdom"), not the ISO code the canonical address needs.
 */
export interface RawSpotlerCompany {
  id: number
  name: string
  addressline?: string | null
  addresscity?: string | null
  'addresscounty/state'?: string | null
  'addresspostcode/zip'?: string | null
  addresscountry?: string | null
  ownerid?: number | null
  phone?: string | null
  website?: string | null
  sector?: string | null
  [key: string]: unknown
}

/** A documented string field, or undefined when it is null or empty. */
function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function transformCompany(raw: RawSpotlerCompany): Company {
  const line1 = text(raw.addressline)
  const city = text(raw.addresscity)
  const region = text(raw['addresscounty/state'])
  const postalCode = text(raw['addresspostcode/zip'])
  const hasAddress = [line1, city, region, postalCode].some((v) => v !== undefined)
  return {
    id: String(raw.id),
    name: raw.name,
    phone: text(raw.phone),
    industry: text(raw.sector),
    owner_id: raw.ownerid != null ? String(raw.ownerid) : undefined,
    address: hasAddress ? { line1, city, region, postalCode } : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.accountname = data.name
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
