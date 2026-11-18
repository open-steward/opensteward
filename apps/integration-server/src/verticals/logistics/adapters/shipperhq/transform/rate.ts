import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ── ShipperHQ Rates API ────────────────────────────────────────────────────
// Documented via retrieveShippingQuote GraphQL query and REST/RMS equivalent.
// Source: github.com/shipperhq/library-graphql (Types/RatingCarrier, Types/BasicShippingRate)
// Each carrier in the response contains one or more shippingRates entries.

export interface ShipperhqBasicShippingRate {
  code: string
  title?: string | null
  totalCharges?: number | null
  transitTime?: number | null
  deliveryDate?: string | null
  currency?: string | null
  [key: string]: unknown
}

export interface ShipperhqRatingCarrier {
  carrierCode: string
  carrierTitle?: string | null
  carrierType?: string | null
  shippingRates?: ShipperhqBasicShippingRate[]
  error?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface ShipperhqRateResponse {
  transactionId?: string | null
  carriers?: ShipperhqRatingCarrier[]
  errors?: Record<string, unknown>[] | null
  [key: string]: unknown
}

export function transformRates(raw: ShipperhqRateResponse): Rate[] {
  const carriers = raw.carriers ?? []
  const rates: Rate[] = []

  for (const carrier of carriers) {
    if (carrier.error) continue
    const shippingRates = carrier.shippingRates ?? []
    for (const sr of shippingRates) {
      rates.push({
        carrierId: carrier.carrierCode,
        serviceCode: sr.code,
        serviceName: sr.title ?? undefined,
        currency: sr.currency ?? undefined,
        totalAmount: parseDecimal(sr.totalCharges),
        transitDays: sr.transitTime != null ? Math.round(sr.transitTime) : undefined,
        deliveryDays: sr.transitTime != null ? Math.round(sr.transitTime) : undefined,
        estimatedDeliveryAt: toISODate(sr.deliveryDate),
        metadata: { ...carrier, rate: sr } as Record<string, unknown>,
      })
    }
  }

  return rates
}
