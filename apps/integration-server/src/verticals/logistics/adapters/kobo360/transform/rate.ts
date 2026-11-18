import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Raw Kobo360 rate / quote object returned from POST /quotes
 */
export interface Kobo360RateResponse {
  id?: string
  quote_id?: string
  service_type?: string
  service_name?: string
  total_price?: number
  currency?: string
  estimated_delivery_date?: string
  transit_days?: number
  guaranteed?: boolean
  [key: string]: unknown
}

export interface Kobo360RatesResponse {
  quotes?: Kobo360RateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: Kobo360RateResponse): Rate {
  return {
    id: raw.id ?? raw.quote_id ?? undefined,
    carrierId: 'kobo360',
    serviceCode: raw.service_type ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'NGN',
    totalAmount: parseDecimal(raw.total_price),
    transitDays: raw.transit_days != null ? Math.round(Number(raw.transit_days)) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
