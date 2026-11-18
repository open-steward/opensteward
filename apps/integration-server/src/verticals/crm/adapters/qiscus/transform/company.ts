import type { Company } from '../../../schema/company'

// Qiscus does not have a native company/organization entity
// This is a stub — list returns [] and write methods throw
export interface RawQiscusCompany {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawQiscusCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  return out
}
