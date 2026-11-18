import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * shipcloud carrier object returned from GET /carriers
 */
export interface ShipcloudCarrier {
  name: string
  display_name?: string | null
  services?: ShipcloudCarrierService[] | null
  [key: string]: unknown
}

export interface ShipcloudCarrierService {
  name: string
  display_name?: string | null
  [key: string]: unknown
}

/**
 * Transform a shipcloud carrier to the canonical Carrier type.
 */
export function transformCarrier(raw: ShipcloudCarrier): Carrier {
  const services: CarrierService[] = (raw.services ?? []).map((svc) => ({
    code: svc.name,
    name: svc.display_name ?? svc.name,
  }))

  return {
    id: raw.name,
    code: raw.name,
    name: raw.display_name ?? raw.name,
    services: services.length > 0 ? services : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
