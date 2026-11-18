import type { Company } from '../../../schema/company'
import {
  optDate,
  optString,
  primaryAddress,
  requireKey,
  solePhone,
  type RawSageCrmAddress,
  type RawSageCrmEmail,
  type RawSageCrmPhone,
} from '../records'

/** components.schemas.Company of the Sage CRM 2024 R2 RESTful API reference (fields read here). */
export interface RawSageCrmCompany {
  Comp_CompanyId?: number
  Comp_Name?: string
  Comp_PrimaryUserId?: string
  Comp_PrimaryAddressId?: number
  Comp_CreatedDate?: string
  Comp_UpdatedDate?: string
  Email?: RawSageCrmEmail[]
  Phone?: RawSageCrmPhone[]
  Address?: RawSageCrmAddress[]
  [key: string]: unknown
}

export function transformCompany(raw: RawSageCrmCompany): Company {
  const id = requireKey(raw.Comp_CompanyId, 'Comp_CompanyId')
  // Comp_Name is the one required property of the documented Company schema.
  if (typeof raw.Comp_Name !== 'string') {
    throw Object.assign(new Error(`Sage CRM company ${id} has no Comp_Name`), { statusCode: 502 })
  }
  const company: Company = {
    id,
    name: raw.Comp_Name,
    metadata: raw,
  }
  const phone = solePhone(raw.Phone)
  if (phone) company.phone = phone
  const owner = optString(raw.Comp_PrimaryUserId)
  if (owner) company.owner_id = owner
  const address = primaryAddress(raw.Address, raw.Comp_PrimaryAddressId)
  if (address) company.address = address
  const created = optDate(raw.Comp_CreatedDate)
  if (created) company.created_at = created
  const updated = optDate(raw.Comp_UpdatedDate)
  if (updated) company.updated_at = updated
  return company
}

// Write mapping below is unchanged by the read rebuild (write methods are out
// of its scope); its field names are not from the documented Company schema.
export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.comp_name = data.name
  if (data.phone !== undefined) out.comp_phone = data.phone
  if (data.domain !== undefined) out.comp_website = data.domain
  if (data.industry !== undefined) out.comp_industry = data.industry
  return out
}
