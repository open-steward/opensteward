import type { Company } from '../../../schema/company'

// Solve360 calls companies "Organisations"
export interface RawSolveOrganisation {
  id?: string | number
  name?: string
  phone?: string
  website?: string | null
  industry?: string | null
  assignee?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawSolveOrganisation): Company {
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
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    phone: raw.phone,
    domain,
    industry: raw.industry ?? undefined,
    owner_id: raw.assignee != null ? String(raw.assignee) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.assignee = data.owner_id
  return out
}
