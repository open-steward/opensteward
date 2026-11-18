import type { Company } from '../../../schema/company'

// Mautic Company entity
export interface RawMauticCompany {
  id?: string | number
  companyname?: string
  companyphone?: string
  companywebsite?: string
  companyindustry?: string
  fields?: {
    all?: Record<string, unknown>
    core?: Record<string, unknown>
  }
  owner?: { id?: string | number } | null
  dateAdded?: string
  dateModified?: string
  [key: string]: unknown
}

function getField(raw: RawMauticCompany, key: string): string | undefined {
  const flat = raw[key]
  if (flat !== undefined && flat !== null) return String(flat)
  const all = raw.fields?.all
  if (all && all[key] !== undefined && all[key] !== null) return String(all[key])
  return undefined
}

export function transformCompany(raw: RawMauticCompany): Company {
  return {
    id: String(raw.id ?? ''),
    name: getField(raw, 'companyname') ?? '',
    phone: getField(raw, 'companyphone'),
    domain: getField(raw, 'companywebsite'),
    industry: getField(raw, 'companyindustry'),
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.dateAdded,
    updated_at: raw.dateModified,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.companyname = data.name
  if (data.phone !== undefined) out.companyphone = data.phone
  if (data.domain !== undefined) out.companywebsite = data.domain
  if (data.industry !== undefined) out.companyindustry = data.industry
  return out
}
