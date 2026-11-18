import type { Company } from '../../../schema/company'

export interface RawApptivoCompany {
  customerId?: string
  id?: string
  name?: string
  phoneList?: Array<{ phone?: string; type?: string }>
  website?: string | null
  industry?: string | null
  assigneeId?: string | null
  createdDate?: string | null
  modifiedDate?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawApptivoCompany): Company {
  const id = raw.customerId ?? raw.id ?? ''
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
    name: raw.name ?? '',
    phone: raw.phoneList?.[0]?.phone,
    domain,
    industry: raw.industry ?? undefined,
    owner_id: raw.assigneeId != null ? String(raw.assigneeId) : undefined,
    created_at: raw.createdDate ?? undefined,
    updated_at: raw.modifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phoneList = [{ phone: data.phone, type: 'work' }]
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.assigneeId = data.owner_id
  return out
}
