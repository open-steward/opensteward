import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface TforceRateLineItem {
  code: string
  description: string
  amount: number
  [key: string]: unknown
}

export interface TforceRateQuote {
  quoteNumber: string
  serviceLevel: string
  serviceLevelDescription: string | null
  totalCharges: number
  currency: string | null
  transitDays: number | null
  estimatedDeliveryDate: string | null
  guaranteed: boolean | null
  lineItems: TforceRateLineItem[] | null
  [key: string]: unknown
}

export interface TforceRateResponse {
  rateQuotes: TforceRateQuote[]
  [key: string]: unknown
}

export function transformRate(raw: TforceRateQuote): Rate {
  return {
    id: raw.quoteNumber ?? undefined,
    carrierId: 'tforce-freight',
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
