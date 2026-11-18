import type { Company } from '../../../schema/company'

// Dolibarr companies endpoint: GET /thirdparties
export interface RawDolibarrThirdParty {
  id?: string | number
  name?: string
  url?: string
  phone?: string
  industry?: string
  effectif?: string  // staff size
  date_creation?: string | number
  date_modification?: string | number
  [key: string]: unknown
}

export function transformCompany(raw: RawDolibarrThirdParty): Company {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    domain: raw.url ?? undefined,
    phone: raw.phone ?? undefined,
    created_at: raw.date_creation
      ? new Date(Number(raw.date_creation) * 1000).toISOString()
      : undefined,
    updated_at: raw.date_modification
      ? new Date(Number(raw.date_modification) * 1000).toISOString()
      : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  if (data.domain !== undefined) out['url'] = data.domain
  if (data.phone !== undefined) out['phone'] = data.phone
  return out
}
