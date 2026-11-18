import type { Company } from '../../../schema/company'
import {
  address,
  entityId,
  main,
  refId,
  requiredString,
  str,
  type TeamworkAddressFields,
  type TeamworkPhoneNumber,
  type TeamworkRef,
} from '../raw'

/**
 * The Company model of `GET /companies.json` (`companies[]`) and
 * `GET /companies/{id}.json` (`company`), documented fields only
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/companies/get-companiesjson).
 */
export interface RawTeamworkCompany extends TeamworkAddressFields {
  id: number
  name: string
  /** "Companies website URL." */
  website?: string | null
  phoneNumbers?: TeamworkPhoneNumber[] | null
  owner?: TeamworkRef | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

/** The host of the documented `website` URL, when it parses as one. */
function domainOf(website: string | undefined): string | undefined {
  if (!website) return undefined
  try {
    return new URL(website).hostname || undefined
  } catch {
    return undefined
  }
}

export function transformCompany(raw: RawTeamworkCompany): Company {
  return {
    id: entityId(raw, 'company'),
    name: requiredString(raw.name, 'name', 'company'),
    domain: domainOf(str(raw.website)),
    // "The phone number, excluding the country code (this can be specified with `code`)."
    phone: str(main(raw.phoneNumbers)?.number),
    owner_id: refId(raw.owner),
    address: address(raw),
    created_at: str(raw.createdAt),
    updated_at: str(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
