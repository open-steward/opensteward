import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * Raw Accelo company object as returned by GET /companies or GET /companies/{id}.
 *
 * Default fields: id, name, status, date_created, date_modified.
 * Optional fields (via _fields): phone, website, size.
 */
export interface RawAcceloCompany {
  id: string | number
  name?: string
  phone?: string
  website?: string
  size?: string | number
  status?: string | number | { id: string | number; title?: string; [key: string]: unknown }
  date_created?: string | number
  date_modified?: string | number
  [key: string]: unknown
}

export function transformCompany(raw: RawAcceloCompany): Company {
  const sizeRaw = raw.size
  let size: number | undefined
  if (sizeRaw != null) {
    const parsed = typeof sizeRaw === 'number' ? sizeRaw : parseInt(String(sizeRaw), 10)
    if (!isNaN(parsed)) size = parsed
  }

  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone ?? undefined,
    // Accelo calls this "website"; map to canonical "domain"
    domain: raw.website ?? undefined,
    size,
    created_at: toIsoDatetime(raw.date_created),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  // Canonical domain maps to Accelo's website field
  if (data.domain !== undefined) out.website = data.domain
  return out
}
