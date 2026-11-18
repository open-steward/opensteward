import type { Company } from '../../../schema/company'

export interface RawNetsuiteCompany {
  id: string | number
  companyName?: string
  phone?: string
  url?: string
  industry?: { id?: string | number; name?: string } | null
  owner?: { id: string | number } | null
  dateCreated?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawNetsuiteCompany): Company {
  return {
    id: String(raw.id),
    name: raw.companyName ?? '',
    phone: raw.phone ?? undefined,
    domain: raw.url ?? undefined,
    industry: raw.industry?.name ?? undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.dateCreated ?? undefined,
    updated_at: raw.lastModifiedDate ?? undefined,
    metadata: raw,
  }
}
