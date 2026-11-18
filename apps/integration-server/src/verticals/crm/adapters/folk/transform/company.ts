import type { Company } from '../../../schema/company'

// ── Raw Folk types ─────────────────────────────────────────────────────────
//
// `components.schemas.Company` in https://developer.folk.app/schemas/2025-06-09.json
// (GET /v1/companies items, GET /v1/companies/{companyId} data). Only the
// fields the transform reads are typed; the rest ride along in metadata.
// Folk documents no domain field (`urls` holds URLs), so `domain` is not set.

export interface RawFolkCompany {
  id: string
  name: string
  industry?: string
  phones?: string[]
  /** ISO date-time; nullable in the spec. */
  createdAt?: string | null
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformCompany(raw: RawFolkCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    industry: raw.industry || undefined,
    phone: raw.phones?.[0] || undefined,
    created_at: raw.createdAt ?? undefined,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  if (data.domain !== undefined) out['domain'] = data.domain
  return out
}
