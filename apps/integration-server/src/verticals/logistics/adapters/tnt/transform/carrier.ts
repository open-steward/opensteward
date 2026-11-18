import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * TNT service code listing.
 * TNT (FedEx) returns service options from the pricing/getprice endpoint.
 * We synthesise a single Carrier record representing TNT itself.
 */
export interface TntServiceCode {
  serviceCode?: string | null
  serviceName?: string | null
  transitDays?: number | null
  guaranteed?: boolean | null
  [key: string]: unknown
}

export function transformServiceToCarrierService(raw: TntServiceCode): CarrierService {
  return {
    code: raw.serviceCode ?? 'UNKNOWN',
    name: raw.serviceName ?? undefined,
    transitDaysMin: raw.transitDays ?? undefined,
    transitDaysMax: raw.transitDays ?? undefined,
    isGuaranteed: raw.guaranteed ?? undefined,
  }
}

export function transformCarrier(services: TntServiceCode[]): Carrier {
  return {
    id: 'tnt',
    name: 'TNT',
    code: 'TNT',
    trackingUrlTemplate: 'https://www.tnt.com/express/en_gb/site/shipment-tracking.html?searchType=con&cons={trackingNumber}',
    services: services.length > 0 ? services.map(transformServiceToCarrierService) : undefined,
    isActive: true,
    metadata: { source: 'tnt-adapter' } as Record<string, unknown>,
  }
}
