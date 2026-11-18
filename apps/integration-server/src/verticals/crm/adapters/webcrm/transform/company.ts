import type { Company } from '../../../schema/company'

export interface RawWebcrmOrganisation {
  OrganisationId?: number
  OrganisationName?: string
  OrganisationPhone?: string
  OrganisationWebsite?: string
  OrganisationIndustry?: string
  OwnedBy?: number
  OrganisationCreatedAt?: string
  OrganisationUpdatedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawWebcrmOrganisation): Company {
  return {
    id: String(raw.OrganisationId ?? ''),
    name: raw.OrganisationName ?? '',
    phone: raw.OrganisationPhone,
    domain: raw.OrganisationWebsite,
    industry: raw.OrganisationIndustry,
    owner_id: raw.OwnedBy != null ? String(raw.OwnedBy) : undefined,
    created_at: raw.OrganisationCreatedAt,
    updated_at: raw.OrganisationUpdatedAt,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.OrganisationName = data.name
  if (data.phone !== undefined) out.OrganisationPhone = data.phone
  if (data.domain !== undefined) out.OrganisationWebsite = data.domain
  if (data.industry !== undefined) out.OrganisationIndustry = data.industry
  return out
}
