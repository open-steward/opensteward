import type { Company } from '../../../schema/company'

// Ortto is primarily contact/marketing focused — company support is limited.
export interface RawOrttoCompany {
  id?: string
  name?: string
  domain?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawOrttoCompany): Company {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    domain: raw.domain,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.domain = data.domain
  return out
}
