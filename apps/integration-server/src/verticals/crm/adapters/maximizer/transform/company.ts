import type { Company } from '../../../schema/company'
import { requireKey, str, toAddress, zonedIso, type RawOctopusAddress } from '../octopus'

/**
 * An AbEntry of Type Company
 * (https://developer.maximizer.com/reference/octopus-api-docs-objects-abentry:
 * "**CompanyName**: This field is mandatory for the Company.").
 */
export interface RawMaximizerCompany {
  Key?: string
  Type?: string
  CompanyName?: string | null
  Phone?: string | null
  Address?: RawOctopusAddress | null
  CreationDate?: string | null
  LastModifyDate?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawMaximizerCompany): Company {
  const id = requireKey(raw, 'AbEntry')
  const name = str(raw.CompanyName)
  if (!name) throw new Error(`Maximizer company ${id} has no CompanyName`)
  return {
    id,
    name,
    phone: str(raw.Phone),
    address: toAddress(raw.Address),
    created_at: zonedIso(raw.CreationDate),
    updated_at: zonedIso(raw.LastModifyDate),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.CompanyName = data.name
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.domain !== undefined) out.Website = data.domain
  if (data.industry !== undefined) out.Industry = data.industry
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  return out
}
