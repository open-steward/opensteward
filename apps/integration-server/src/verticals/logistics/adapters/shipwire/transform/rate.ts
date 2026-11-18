import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Shipwire raw types ────────────────────────────────────────────────────
// Source: POST /api/v3.1/rate
// Docs:   https://www.shipwire.com/developers/rate/
// The Rate API returns a list of service-level quotes.  Each quote includes
// carrier, service level, cost, currency, and transit time information.

export interface ShipwireRateQuote {
  carrier_code: string | null
  service_code: string | null
  service_name: string | null
  currency: string | null
  cost: number | null
  retail_cost: number | null
  transit_days: number | null
  delivery_days: number | null
  estimated_delivery_at: string | null
  is_guaranteed: boolean | null
  [key: string]: unknown
}

export interface ShipwireRateResponse {
  items: ShipwireRateQuote[] | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: ShipwireRateQuote): Rate {
  return {
    carrierId: raw.carrier_code ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: (raw.currency ?? 'USD') as Rate['currency'],
    totalAmount: parseDecimal(raw.cost),
    retailAmount: parseDecimal(raw.retail_cost),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.delivery_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    isGuaranteedDelivery: raw.is_guaranteed ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
