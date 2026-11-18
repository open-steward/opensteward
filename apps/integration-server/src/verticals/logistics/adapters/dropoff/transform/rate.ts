import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface DropoffRateQuote {
  rate_id?: string | null
  carrier?: string | null
  service_code?: string | null
  service_name?: string | null
  currency?: string | null
  total_amount?: number | string | null
  retail_amount?: number | string | null
  transit_days?: number | null
  delivery_days?: number | null
  estimated_delivery?: string | null
  is_guaranteed?: boolean | null
  [key: string]: unknown
}

export interface DropoffRateQuoteResponse {
  success?: boolean
  data?: DropoffRateQuote[]
  [key: string]: unknown
}

export function transformRate(raw: DropoffRateQuote): Rate {
  return {
    id: raw.rate_id ?? undefined,
    carrierId: raw.carrier ?? 'dropoff',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.total_amount),
    retailAmount: parseDecimal(raw.retail_amount),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.delivery_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    isGuaranteedDelivery: raw.is_guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRateList(raws: DropoffRateQuote[]): Rate[] {
  return raws.map(transformRate)
}
