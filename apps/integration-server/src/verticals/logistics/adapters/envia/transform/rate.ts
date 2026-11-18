import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Rate object returned by POST /ship/rate.
 * Envia returns one rate object per carrier/service combination.
 */
export interface EnviaRate {
  carrier?: string | null
  service?: string | null
  serviceDescription?: string | null
  currency?: string | null
  totalPrice?: number | string | null
  basePrice?: number | string | null
  surcharges?: number | string | null
  deliveryDays?: number | null
  deliveryDate?: string | null
  deliveryEstimate?: string | null
  guaranteed?: boolean | null
  logo?: string | null
  [key: string]: unknown
}

export function transformRate(raw: EnviaRate): Rate {
  return {
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    serviceName: raw.serviceDescription ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: (() => {
      const v = parseDecimal(raw.totalPrice)
      return v != null ? Math.round(v * 100) : undefined
    })(),
    retailAmount: (() => {
      const v = parseDecimal(raw.basePrice)
      return v != null ? Math.round(v * 100) : undefined
    })(),
    deliveryDays: raw.deliveryDays ?? undefined,
    transitDays: raw.deliveryDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.deliveryDate ?? raw.deliveryEstimate),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
