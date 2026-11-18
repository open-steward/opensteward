import type { Company } from '../../../schema/company'

export interface RawOntraportCompany {
  id: string
  name?: string
  office_phone?: string
  website?: string
  owner?: string | null
  date?: string | null
  dlm?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawOntraportCompany): Company {
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
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.office_phone,
    domain,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: raw.date ?? undefined,
    updated_at: raw.dlm ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.office_phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
