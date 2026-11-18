import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface DaytonRateLineItem {
  code: string
  description: string
  amount: number
  [key: string]: unknown
}

export interface DaytonRateQuote {
  quoteNumber: string
  serviceLevel: string
  serviceLevelDescription: string | null
  totalCharges: number
  currency: string | null
  transitDays: number | null
  estimatedDeliveryDate: string | null
  guaranteed: boolean | null
  lineItems: DaytonRateLineItem[] | null
  [key: string]: unknown
}

export interface DaytonRateResponse {
  quote: DaytonRateQuote | null
  [key: string]: unknown
}

export function transformRate(raw: DaytonRateQuote): Rate {
  return {
    id: raw.quoteNumber ?? undefined,
    carrierId: 'dayton-freight',
    serviceCode: raw.serviceLevel ?? undefined,
    serviceName: raw.serviceLevelDescription ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.totalCharges),
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
