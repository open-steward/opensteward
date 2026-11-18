import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

// ─── nShift raw types ────────────────────────────────────────────────────────

/**
 * A single service entry returned within a partner object from
 * GET /meta/lists/partners.
 */
export interface NShiftPartnerService {
  id?: string | null
  name?: string | null
  [key: string]: unknown
}

/**
 * Raw partner/carrier object returned by GET /meta/lists/partners.
 *
 * The endpoint returns all carriers (partners) and their sub-services
 * configured for the authenticated account. Fields confirmed from the
 * nShift Delivery REST API RAML specification at
 * https://api.unifaun.com/rs-docs/ and the APIConnect documentation.
 */
export interface NShiftPartner {
  id?: string | null
  name?: string | null
  services?: NShiftPartnerService[] | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformCarrier(raw: NShiftPartner): Carrier {
  return {
    id: raw.id ?? undefined,
    name: raw.name ?? undefined,
    code: raw.id ?? undefined,
    services: (raw.services ?? [])
      .filter((s) => s.id != null)
      .map((s) => ({
        code: s.id as string,
        name: s.name ?? undefined,
      })),
    isActive: true,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}
