import type { Rate } from '../../../schema/rate'

/**
 * Response from POST /orders/dropoff/quote or POST /orders/pickup/quote.
 */
export interface SenpexQuoteResponse {
  api_token?: string | null
  order_price?: number | string | null
  distance_miles?: number | string | null
  expire_mins?: number | null
  routes?: Array<{
    route_to_text?: string | null
    [key: string]: unknown
  }> | null
  [key: string]: unknown
}

export function transformRate(raw: SenpexQuoteResponse): Rate {
  const price = raw.order_price != null ? Number(raw.order_price) : undefined

  return {
    carrierId: 'senpex',
    serviceCode: 'senpex_delivery',
    serviceName: 'Senpex Delivery',
    currency: 'USD',
    totalAmount: price,
    metadata: raw as Record<string, unknown>,
  }
}
