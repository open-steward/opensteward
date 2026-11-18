import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ArcbestRateLineItem {
  code: string
  description: string
  amount: number
  [key: string]: unknown
}

export interface ArcbestRateQuote {
  quoteId: string
  serviceLevel: string
  serviceLevelDescription: string | null
  totalAmount: number
  currency: string | null
  transitDays: number | null
  estimatedDeliveryDate: string | null
  guaranteed: boolean | null
  lineItems: ArcbestRateLineItem[] | null
  [key: string]: unknown
}

export interface ArcbestRateResponse {
  quotes: ArcbestRateQuote[]
  [key: string]: unknown
}

export function transformRate(raw: ArcbestRateQuote): Rate {
  return {
    id: raw.quoteId ?? undefined,
    carrierId: 'arcbest',
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
