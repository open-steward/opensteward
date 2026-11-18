import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface NinjaVanRateResponse {
  serviceType: string
  serviceName: string
  totalPrice?: number
  currency?: string
  estimatedDeliveryDate?: string
  [key: string]: unknown
}

export interface NinjaVanRatesResponse {
  rates: NinjaVanRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: NinjaVanRateResponse): Rate {
  return {
    id: undefined,
    carrierId: 'ninja-van',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? 'SGD',
    totalAmount: parseDecimal(raw.totalPrice),
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
