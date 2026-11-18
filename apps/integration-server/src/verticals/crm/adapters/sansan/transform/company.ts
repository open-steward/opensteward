import type { Company } from '../../../schema/company'

// Sansan does not have a standalone company/organization API.
// This transform is a placeholder; listCompanies returns [].
export interface RawSansanCompany {
  id?: string
  name?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSansanCompany): Company {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  return out
}
