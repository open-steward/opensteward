import type { Carrier } from '../../../schema/carrier'
import type { EshipzRate } from './rate'

/**
 * Derive a Carrier record from a rate entry returned by `POST /v2/services`.
 *
 * eShipz has no dedicated carrier-list endpoint; carrier identity is embedded
 * in each rate object (vendor_id, slug, description).  We de-duplicate by slug
 * in the adapter layer (listCarriers).
 */
export function transformCarrierFromRate(raw: EshipzRate): Carrier {
  return {
    id: raw.vendor_id != null ? String(raw.vendor_id) : (raw.slug ?? undefined),
    name: raw.description ?? raw.slug ?? undefined,
    code: raw.slug ?? undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
