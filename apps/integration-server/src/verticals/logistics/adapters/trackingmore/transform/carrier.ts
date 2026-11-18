import type { Carrier } from '../../../schema/carrier'

/**
 * Raw courier object from TrackingMore GET /couriers/all.
 */
export interface TrackingMoreCourier {
  courier_code?: string | null
  courier_name?: string | null
  web_url?: string | null
  phone?: string | null
  required_fields?: string[] | null
  type?: string | null
  country_code?: string | null
  [key: string]: unknown
}

/**
 * Transform a TrackingMore courier into a canonical Carrier.
 */
export function transformCarrier(raw: TrackingMoreCourier): Carrier {
  return {
    id: raw.courier_code ?? undefined,
    name: raw.courier_name ?? undefined,
    code: raw.courier_code ?? undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
