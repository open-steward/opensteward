import type { Company } from '../../../schema/company'

export interface RawWorkbooksOrganisation {
  id: string | number
  name?: string
  industry?: string
  'main_location[telephone]'?: string
  'main_location[website]'?: string
  assigned_to_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawWorkbooksOrganisation): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    industry: raw.industry,
    phone: raw['main_location[telephone]'],
    domain: raw['main_location[website]'],
    owner_id: raw.assigned_to_id !== undefined ? String(raw.assigned_to_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  if (data.industry !== undefined) out['industry'] = data.industry
  if (data.phone !== undefined) out['main_location[telephone]'] = data.phone
  if (data.domain !== undefined) out['main_location[website]'] = data.domain
  return out
}
