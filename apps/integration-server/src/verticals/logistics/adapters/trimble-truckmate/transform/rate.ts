import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface TrimbleTruckmateRateResponse {
  quoteId?: string
  rateId?: string
  serviceType?: string
  serviceCode?: string
  serviceName?: string
  carrierName?: string
  totalPrice?: number
  totalCharge?: number
  currency?: string
  estimatedPickupDate?: string
  estimatedDeliveryDate?: string
  transitDays?: number
  deliveryDays?: number
  isGuaranteed?: boolean
  [key: string]: unknown
}

export interface TrimbleTruckmateRatesResponse {
  quotes?: TrimbleTruckmateRateResponse[]
  rates?: TrimbleTruckmateRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: TrimbleTruckmateRateResponse): Rate {
  const totalPrice = parseDecimal(raw.totalPrice ?? raw.totalCharge)
  return {
    id: raw.quoteId ?? raw.rateId ?? undefined,
    carrierId: 'trimble-truckmate',
    serviceCode: raw.serviceCode ?? raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? raw.carrierName ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: totalPrice != null ? Math.round(totalPrice * 100) : undefined,
    transitDays: raw.transitDays ?? raw.deliveryDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.isGuaranteed ?? undefined,
    createdAt: toISODate(raw.estimatedPickupDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function extractRates(raw: TrimbleTruckmateRatesResponse): TrimbleTruckmateRateResponse[] {
  return raw.quotes ?? raw.rates ?? []
}
