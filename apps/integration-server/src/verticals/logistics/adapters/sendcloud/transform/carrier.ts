import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

// ─── Sendcloud raw types ─────────────────────────────────────────────────────

export interface SendcloudShippingMethodCountry {
  id?: number | null
  name?: string | null
  price?: number | null
  iso_2?: string | null
  iso_3?: string | null
  lead_time_hours?: number | null
}

export interface SendcloudShippingMethod {
  id: number | string
  name?: string | null
  carrier?: string | null
  min_weight?: string | number | null
  max_weight?: string | number | null
  service_point_input?: string | null
  price?: number | null
  countries?: SendcloudShippingMethodCountry[] | null
  [key: string]: unknown
}

export interface SendcloudShippingMethodsResponse {
  shipping_methods?: SendcloudShippingMethod[] | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

function mapService(method: SendcloudShippingMethod): CarrierService {
  return {
    code: String(method.id),
    name: method.name ?? undefined,
  }
}

export function transformCarrier(raw: SendcloudShippingMethod): Carrier {
  const carrierCode = raw.carrier ?? String(raw.id)

  return {
    id: String(raw.id),
    name: raw.name ?? undefined,
    code: carrierCode,
    isActive: true,
    services: [mapService(raw)],
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Group individual shipping methods by carrier code and merge into one
 * Carrier record per carrier, with each method exposed as a service.
 */
export function groupShippingMethodsByCarrier(
  methods: SendcloudShippingMethod[],
): Carrier[] {
  const map = new Map<string, Carrier>()

  for (const method of methods) {
    const code = method.carrier ?? String(method.id)
    const service: CarrierService = {
      code: String(method.id),
      name: method.name ?? undefined,
    }

    if (map.has(code)) {
      const existing = map.get(code)!
      existing.services = [...(existing.services ?? []), service]
    } else {
      map.set(code, {
        id: code,
        name: method.name ?? code,
        code,
        isActive: true,
        services: [service],
        metadata: { carrier_code: code } as Record<string, unknown>,
      })
    }
  }

  return Array.from(map.values())
}
