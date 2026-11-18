import type { Company } from '../../../schema/company'

/**
 * Raw Daylite company (organisation) as returned by GET /v1/companies and
 * GET /v1/companies/:id.
 *
 * The Daylite REST API uses snake_case field names.
 *
 * Docs: https://developer.daylite.app/reference/company-details.md
 */
export interface RawDayliteCompany {
  /** Relative resource URL, e.g. "/v1/companies/42" */
  self?: string
  name?: string
  /** Phone number entries */
  phone_numbers?: Array<{ number?: string; label?: string; format?: string }>
  /** Industry/category label */
  category?: string
  /** Owner user URL, e.g. "/v1/users/7" */
  owner?: string
  /** ISO 8601 creation timestamp (read-only) */
  create_date?: string
  /** ISO 8601 last-modified timestamp (read-only) */
  modify_date?: string
  [key: string]: unknown
}

function extractId(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/(\d+)$/)
  return match ? match[1] : undefined
}

export function transformCompany(raw: RawDayliteCompany): Company {
  const selfId = extractId(raw.self)
  const firstPhone = raw.phone_numbers?.find((p) => p.number)?.number
  const ownerId = extractId(raw.owner)

  return {
    id: selfId ?? String(raw['id'] ?? ''),
    name: raw.name ?? '',
    phone: firstPhone ?? undefined,
    industry: raw.category ?? undefined,
    owner_id: ownerId,
    created_at: raw.create_date ?? undefined,
    updated_at: raw.modify_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) {
    out.phone_numbers = [{ number: data.phone, label: 'work' }]
  }
  if (data.industry !== undefined) out.category = data.industry
  return out
}
