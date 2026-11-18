import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface WarpQuoteResponse {
  quote_id?: string
  mode?: string
  price_usd?: number
  currency?: string
  transit_days?: number
  pickup_date?: string
  delivery_date?: string
  expires_at?: string
  quote_tier?: string
  service?: {
    vehicle?: string
    pricing?: string
    included_at_no_charge?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformRate(raw: WarpQuoteResponse): Rate {
  const totalAmount =
    raw.price_usd !== undefined && raw.price_usd !== null
      ? Math.round((parseDecimal(raw.price_usd) ?? 0) * 100)
      : undefined

  return {
    id: raw.quote_id ?? undefined,
    carrierId: 'warp',
    serviceCode: raw.mode ?? undefined,
    serviceName: raw.service?.vehicle ?? raw.mode ?? undefined,
    currency: (raw.currency ?? 'USD') as 'USD',
    totalAmount,
    transitDays: raw.transit_days !== undefined ? Math.round(raw.transit_days) : undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    isGuaranteedDelivery: raw.quote_tier === 'firm',
    createdAt: toISODate(raw.expires_at),
    metadata: raw as Record<string, unknown>,
  }
}
