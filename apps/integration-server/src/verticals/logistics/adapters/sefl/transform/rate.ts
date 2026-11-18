import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface SeflRateLineItem {
  code: string
  description: string
  amount: number
  [key: string]: unknown
}

export interface SeflRateQuote {
  quoteNumber: string
  serviceLevel: string
  serviceLevelDescription: string | null
  totalAmount: number
  currency: string | null
  transitDays: number | null
  estimatedDeliveryDate: string | null
  guaranteed: boolean | null
  lineItems: SeflRateLineItem[] | null
  [key: string]: unknown
}

export interface SeflRateResponse {
  quote: SeflRateQuote | null
  [key: string]: unknown
}

export function transformRate(raw: SeflRateQuote): Rate {
  return {
    id: raw.quoteNumber ?? undefined,
    carrierId: 'sefl',
    serviceCode: raw.serviceLevel ?? undefined,
    serviceName: raw.serviceLevelDescription ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.totalAmount),
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
