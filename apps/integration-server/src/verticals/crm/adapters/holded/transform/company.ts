import type { Company } from '../../../schema/company'

export interface RawHoldedCompany {
  id: string
  name?: string
  email?: string
  phone?: string
  contactNum?: string
  tags?: string[]
  [key: string]: unknown
}

export function transformCompany(raw: RawHoldedCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone,
    tags: raw.tags,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'company' }
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
