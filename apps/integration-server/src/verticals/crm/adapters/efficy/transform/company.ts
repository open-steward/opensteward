import type { Company } from '../../../schema/company'

/**
 * `Company_GET` / `Company_GetByID` from
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (GET /api/v1/companies, GET /api/v1/companies/{id}). Only documented fields.
 */
export interface RawEfficyCompany {
  crm_id?: string
  external_id?: string
  name?: string
  phone?: string
  website?: string
  sector?: string
  type?: string
  employee_count?: string
  account_manager?: { crm_id?: string; code?: string; name?: string }
  creation_date?: string
  last_update_date?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawEfficyCompany): Company {
  if (!raw.crm_id) throw new Error('Efficy company has no crm_id')
  // Spec: name is "a required field and serves as the primary identifier for the company record."
  if (!raw.name) throw new Error(`Efficy company ${raw.crm_id} has no name`)
  return {
    id: raw.crm_id,
    name: raw.name,
    phone: raw.phone || undefined,
    industry: raw.sector || undefined,
    owner_id: raw.account_manager?.crm_id || undefined,
    created_at: raw.creation_date,
    updated_at: raw.last_update_date,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.NAME = data.name
  if (data.phone !== undefined) out.PHONE = data.phone
  if (data.domain !== undefined) out.WEBSITE = data.domain
  if (data.industry !== undefined) out.SECTOR = data.industry
  return out
}
