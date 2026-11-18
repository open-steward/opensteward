import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'
import type { ShiptheoryService } from './rate'

/**
 * Shiptheory carrier transform.
 *
 * Shiptheory's GET /services endpoint returns a map of carrier slug → service
 * array. We create one Carrier per unique carrier slug, collecting its services.
 */
export interface ShiptheoryServicesMap {
  [carrier: string]: ShiptheoryService[] | unknown
}

function serviceToCarrierService(raw: ShiptheoryService): CarrierService {
  return {
    code: raw.name ?? 'UNKNOWN',
    name: raw.name ?? undefined,
  }
}

export function transformCarrierFromServices(
  slug: string,
  services: ShiptheoryService[],
): Carrier {
  return {
    id: slug,
    name: slug,
    code: slug,
    services: services.length > 0 ? services.map(serviceToCarrierService) : undefined,
    isActive: true,
    metadata: { source: 'shiptheory-services' } as Record<string, unknown>,
  }
}
