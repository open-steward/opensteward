import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * Reply.io calls companies "contact-accounts".
 * GET /v3/contact-accounts, POST /v3/contact-accounts, PATCH /v3/contact-accounts/{id}
 */
export interface RawReplyIoAccount {
  id: number
  ownerUserId?: number | null
  name: string
  description?: string | null
  domainName?: string | null
  domainSecondary?: string | null
  industry?: string | null
  companySize?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  timeZoneId?: string | null
  linkedInUrl?: string | null
  phone?: string | null
  twitterUrl?: string | null
  logoUrl?: string | null
  email?: string | null
  stage?: { id: number; name: string; colorId: number } | null
  linkedProspectsCount?: number
  createdDate?: string | null
  lastActivityDate?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawReplyIoAccount): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    domain: raw.domainName ?? undefined,
    phone: raw.phone ?? undefined,
    industry: raw.industry ?? undefined,
    owner_id: raw.ownerUserId != null ? String(raw.ownerUserId) : undefined,
    address: (raw.city || raw.state || raw.country)
      ? {
          city: raw.city ?? undefined,
          region: raw.state ?? undefined,
          country: raw.country ?? undefined,
        }
      : undefined,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.domainName = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.ownerUserId = data.owner_id !== null ? Number(data.owner_id) : null
  if (data.address?.city !== undefined) out.city = data.address.city
  if (data.address?.region !== undefined) out.state = data.address.region
  if (data.address?.country !== undefined) out.country = data.address.country
  return out
}
