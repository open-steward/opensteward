import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A rate/service offering returned by the SendParcel API.
 */
export interface SendParcelRate {
  id?: string | null
  carrier?: string | null
  service?: string | null
  serviceName?: string | null
  price?: number | string | null
  currency?: string | null
  deliveryDays?: number | null
  transitDaysMin?: number | null
  transitDaysMax?: number | null
  estimatedDelivery?: string | null
  isGuaranteed?: boolean | null
  createdAt?: string | null
  [key: string]: unknown
}

export function transformRate(raw: SendParcelRate): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.price),
    transitDays: raw.deliveryDays ?? raw.transitDaysMin ?? undefined,
    deliveryDays: raw.deliveryDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDelivery),
    isGuaranteedDelivery: raw.isGuaranteed ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
