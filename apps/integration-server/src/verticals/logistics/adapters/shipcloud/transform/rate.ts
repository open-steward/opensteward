import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * shipcloud shipment_quotes response object.
 * A quote bundles carrier + service + price for the requested package/addresses.
 */
export interface ShipcloudQuote {
  carrier: string
  service?: string | null
  price?: number | string | null
  created_at?: string | null
  [key: string]: unknown
}

/**
 * Wrapper returned by POST /shipment_quotes
 */
export interface ShipcloudQuoteResponse {
  shipment_quote?: ShipcloudQuote | null
  [key: string]: unknown
}

export function transformRate(raw: ShipcloudQuote): Rate {
  const priceDecimal = parseDecimal(raw.price)
  return {
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    currency: 'EUR',
    totalAmount: priceDecimal != null ? Math.round(priceDecimal * 100) : undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
