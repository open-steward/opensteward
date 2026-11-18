import type { Company } from '../../../schema/company'

export interface RawLeadsquaredCompany {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawLeadsquaredCompany): Company {
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
