import type { Company } from '../../../schema/company'

export interface RawWeclappOrganization {
  id: string
  company?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  partyType?: string
  salesManager?: { id: string } | null
  [key: string]: unknown
}

export function transformCompany(raw: RawWeclappOrganization): Company {
  return {
    id: String(raw.id),
    name: raw.company ?? [raw.firstName, raw.lastName].filter(Boolean).join(' ') ?? '',
    phone: raw.phone,
    owner_id: raw.salesManager?.id ? String(raw.salesManager.id) : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = { partyType: 'ORGANIZATION' }
  if (data.name !== undefined) out.company = data.name
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
