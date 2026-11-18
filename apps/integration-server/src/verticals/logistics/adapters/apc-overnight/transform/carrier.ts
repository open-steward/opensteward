/**
 * APC Overnight — ServiceAvailability response → canonical Carrier.
 *
 * APC Overnight is a single UK carrier. Available services are retrieved via
 * POST ServiceAvailability.json at the hypaship v3 API. The adapter's REST
 * abstraction surfaces this as GET /services.
 *
 * Each item in the response `AvailableServices` array carries a `ServiceCode`
 * and `ServiceName` that map to a canonical CarrierService.
 */
import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

// ─── APC Overnight raw types ─────────────────────────────────────────────────

export interface ApcOvernightService {
  ServiceCode?: string | null
  ServiceName?: string | null
  [key: string]: unknown
}

export interface ApcOvernightServiceAvailabilityResponse {
  AvailableServices?: ApcOvernightService[] | null
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function transformService(raw: ApcOvernightService): CarrierService {
  return {
    code: raw.ServiceCode ?? '',
    name: raw.ServiceName ?? undefined,
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * APC Overnight is a single carrier — all available services are grouped under
 * one Carrier record.
 */
export function transformCarrier(raw: ApcOvernightServiceAvailabilityResponse): Carrier {
  const services = (raw.AvailableServices ?? []).map(transformService)
  return {
    id: 'apc-overnight',
    name: 'APC Overnight',
    code: 'apc-overnight',
    trackingUrlTemplate: 'https://apc-overnight.com/receiving-a-parcel/tracking?parcelNumber={trackingNumber}',
    services: services.length > 0 ? services : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
