import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A shipping quote returned by POST /v2/pricing/quotes/available.
 *
 * Response shape:
 *   data.quotes[] → { name, id, totalPrice, pickupStart, pickupEnd, dropoffStart, dropoffEnd }
 *   data.deliveries[] → { index, price, currency, distance, quoteId }
 *   data.type → delivery type string
 *
 * We map each quote entry to a Rate.
 *
 * Docs: https://docs.shippify.co/developers/en/shippify-api/deliveries/delivery-quotes.md
 */
export interface ShippifyRate {
  id?: string | null
  name?: string | null
  totalPrice?: number | null
  price?: number | null
  currency?: string | null
  pickupStart?: string | null
  dropoffEnd?: string | null
  [key: string]: unknown
}

export function transformRate(raw: ShippifyRate): Rate {
  return {
    id: raw.id ?? undefined,
    serviceName: raw.name ?? undefined,
    currency: (raw.currency ?? undefined) as string | undefined,
    totalAmount: parseDecimal(raw.totalPrice ?? raw.price),
    estimatedDeliveryAt: toISODate(raw.dropoffEnd),
    metadata: raw as Record<string, unknown>,
  }
}
