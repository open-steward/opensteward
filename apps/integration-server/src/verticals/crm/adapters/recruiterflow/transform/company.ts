import type { Company } from '../../../schema/company'

/**
 * Recruiterflow client (company) object (external API).
 *
 * Key fields:
 *   id           – numeric client ID
 *   name         – company name
 *   phone        – primary phone number
 *   website_url  – company website
 *   address      – { city, state, country, postal_code }
 *   recruiter_id – owning recruiter ID
 *   created_at   – ISO-8601 creation timestamp
 *   updated_at   – ISO-8601 last-modified timestamp
 */
export interface RawRecruiterflowCompany {
  id: string | number
  name?: string
  phone?: string
  website_url?: string
  address?: {
    city?: string
    state?: string
    country?: string
    postal_code?: string
    street?: string
  }
  recruiter_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformCompany(raw: RawRecruiterflowCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone,
    domain: raw.website_url,
    owner_id: raw.recruiter_id !== undefined ? String(raw.recruiter_id) : undefined,
    address: raw.address
      ? {
          city: raw.address.city,
          region: raw.address.state,
          country: raw.address.country,
          postalCode: raw.address.postal_code,
          line1: raw.address.street,
        }
      : undefined,
    created_at: toIso(raw.created_at),
    updated_at: toIso(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website_url = data.domain
  return out
}
