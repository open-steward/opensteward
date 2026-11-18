import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── TNT raw types ──────────────────────────────────────────────────────────

export interface TntRateOption {
  service: string
  serviceCode: string
  serviceName: string
  currency: string
  totalPrice: number
  transitDays: number | null
  deliveryDate: string | null
  guaranteed: boolean | null
  [key: string]: unknown
}

export interface TntRateResponse {
  rateOptions: TntRateOption[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: TntRateOption): Rate {
  return {
    id: raw.serviceCode ?? undefined,
    carrierId: 'tnt',
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? raw.service ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.totalPrice),
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.deliveryDate),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
