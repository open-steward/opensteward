import type { Rate } from '../../../schema/rate'

export interface ShiptheoryService {
  id?: number | null
  name?: string | null
  carrier?: string | null
  carrier_name?: string | null
  [key: string]: unknown
}

/**
 * Shiptheory's /services endpoint returns carrier service definitions.
 * There is no rate-shopping endpoint; we map service records to Rate objects
 * without amounts since Shiptheory routes via rules rather than presenting
 * real-time rates.
 */
export function transformService(raw: ShiptheoryService): Rate {
  return {
    id: raw.id !== null && raw.id !== undefined ? String(raw.id) : undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.name ?? undefined,
    serviceName: raw.name ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
