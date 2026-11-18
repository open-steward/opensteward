import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface NZPostRateResponse {
  serviceCode: string
  serviceName: string
  totalPrice?: number
  currency?: string
  estimatedDeliveryDate?: string
  transitDays?: number
  [key: string]: unknown
}

export interface NZPostRatesResponse {
  rates: NZPostRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: NZPostRateResponse): Rate {
  return {
    id: undefined,
    carrierId: 'nzpost',
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? 'NZD',
    totalAmount: parseDecimal(raw.totalPrice),
    transitDays: raw.transitDays,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
