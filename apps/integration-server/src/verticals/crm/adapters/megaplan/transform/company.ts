/**
 * Transform between Megaplan API v3 Contractor (company) entities and canonical Company.
 *
 * Megaplan uses "Contractor" for both contacts and companies.
 * A company contractor has typePerson = "company" (vs "human" for person contacts).
 *
 * v3 API fields:
 *   id, contentType, name, actualAddress, legalAddress, phones[], email,
 *   site, responsibles[], timeCreated, timeUpdated
 */

import type { Company } from '../../../schema/company'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMegaplanCompany {
  id?: string | number
  contentType?: string
  name?: string
  email?: string
  phones?: Array<{ number?: string; type?: string } | string>
  site?: string
  /** Responsible employee references */
  responsibles?: Array<{ id?: string | number; contentType?: string }>
  actualAddress?: string | { city?: string; street?: string; [key: string]: unknown }
  legalAddress?: string | { city?: string; street?: string; [key: string]: unknown }
  timeCreated?: string | number
  timeUpdated?: string | number
  [key: string]: unknown
}

export function transformCompany(raw: RawMegaplanCompany): Company {
  const responsibleRef = Array.isArray(raw.responsibles) ? raw.responsibles[0] : undefined
  const ownerId = responsibleRef?.id != null ? String(responsibleRef.id) : undefined

  const phone = extractPhone(raw.phones)

  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    domain: raw.site ?? undefined,
    phone,
    owner_id: ownerId,
    created_at: toIsoDatetime(raw.timeCreated),
    updated_at: toIsoDatetime(raw.timeUpdated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    contentType: 'Contractor',
  }
  if (data.name !== undefined) out['name'] = data.name
  if (data.domain !== undefined) out['site'] = data.domain
  if (data.phone !== undefined) out['phones'] = [{ number: data.phone, type: 'work' }]
  if (data.owner_id !== undefined) {
    out['responsibles'] = [{ contentType: 'Employee', id: data.owner_id }]
  }
  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPhone(
  phones: Array<{ number?: string; type?: string } | string> | undefined,
): string | undefined {
  if (!phones || phones.length === 0) return undefined
  for (const p of phones) {
    if (typeof p === 'string' && p) return p
    if (typeof p === 'object' && p && p.number) return p.number
  }
  return undefined
}
