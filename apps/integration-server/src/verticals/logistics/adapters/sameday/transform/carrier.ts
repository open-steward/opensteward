import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * Raw service object from GET /api/client/services.
 *
 * Response shape (from SamedayGetServicesResponse.php):
 * {
 *   data: [{
 *     id: number,
 *     name: string,
 *     serviceCode: string,
 *     deliveryType: { id: number, name: string },
 *     defaultServices: boolean,
 *     serviceOptionalTaxes: [...]
 *   }],
 *   total: number, currentPage: number, pages: number
 * }
 */
export interface SamedayService {
  id: number
  name: string
  serviceCode: string
  deliveryType: {
    id: number
    name: string
  }
  defaultServices: boolean
  serviceOptionalTaxes: unknown[]
  [key: string]: unknown
}

export interface SamedayServicesPage {
  data: SamedayService[]
  total: number
  currentPage: number
  pages: number
  [key: string]: unknown
}

/**
 * Transform a Sameday service into a canonical CarrierService.
 */
export function transformService(raw: SamedayService): CarrierService {
  return {
    code: raw.serviceCode ?? String(raw.id),
    name: raw.name ?? undefined,
  }
}

/**
 * Sameday is a single carrier; we group all services under one Carrier record
 * and surface each service as a CarrierService.
 */
export function transformServicesToCarrier(services: SamedayService[]): Carrier {
  return {
    id: 'sameday',
    name: 'Sameday Courier',
    code: 'sameday',
    trackingUrlTemplate: 'https://www.sameday.ro/tracking?awb={trackingNumber}',
    services: services.map(transformService),
    isActive: true,
    metadata: { services: services as unknown as Record<string, unknown>[] } as Record<string, unknown>,
  }
}
