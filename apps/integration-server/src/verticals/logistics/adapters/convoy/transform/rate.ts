import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ConvoyRateResponse {
  quoteId: string
  serviceType: string
  serviceName: string
  totalPrice?: number
  currency?: string
  estimatedPickupDate?: string
  estimatedDeliveryDate?: string
  transitDays?: number
  [key: string]: unknown
}

export interface ConvoyRatesResponse {
  quotes: ConvoyRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: ConvoyRateResponse): Rate {
  return {
    id: raw.quoteId ?? undefined,
    carrierId: 'convoy',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.totalPrice),
    transitDays: raw.transitDays,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
