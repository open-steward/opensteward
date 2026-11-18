import type { Company } from '../../../schema/company'

export interface RawActCompany {
  id?: string
  companyId?: string
  name?: string
  companyName?: string
  phone?: string
  website?: string | null
  industry?: string | null
  managerId?: string | null
  created?: string | null
  edited?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawActCompany): Company {
  const id = raw.id ?? raw.companyId ?? ''
  const websiteRaw = raw.website
  let domain: string | undefined
  if (websiteRaw) {
    try {
      domain = new URL(websiteRaw).hostname.replace(/^www\./, '')
    } catch {
      domain = websiteRaw
    }
  }
  return {
    id: String(id),
    name: raw.companyName ?? raw.name ?? '',
    phone: raw.phone,
    domain,
    industry: raw.industry ?? undefined,
    owner_id: raw.managerId != null ? String(raw.managerId) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.edited ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.companyName = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.managerId = data.owner_id
  return out
}
