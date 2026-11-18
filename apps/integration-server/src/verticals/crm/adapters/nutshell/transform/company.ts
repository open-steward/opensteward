import type { Company } from '../../../schema/company'

export interface RawNutshellCompany {
  id: number | string
  name: string
  url?: string
  phones?: Record<string, string[]> | string[]
  accounts?: Array<{ id: number | string; name?: string }>
  owner?: { id: number | string } | null
  createdTime?: string
  modifiedTime?: string
  [key: string]: unknown
}

function firstPhone(phones?: Record<string, string[]> | string[]): string | undefined {
  if (!phones) return undefined
  if (Array.isArray(phones)) return phones[0]
  for (const vals of Object.values(phones)) {
    if (vals.length > 0) return vals[0]
  }
  return undefined
}

export function transformCompany(raw: RawNutshellCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.url,
    phone: firstPhone(raw.phones),
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.createdTime,
    updated_at: raw.modifiedTime,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.url = data.domain
  if (data.phone !== undefined) out.phones = { work: [data.phone] }
  if (data.owner_id !== undefined) {
    out.owner = { id: Number(data.owner_id), entityType: 'Users' }
  }
  return out
}
