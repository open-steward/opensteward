import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/** Individual rate entry nested inside a ShippingRate response. */
export interface UnifiedShippingRateRate {
  title: string
  amount?: number | null
  baseAmount?: number | null
  currency?: string | null
  deliveryDays?: number | null
  estimatedDays?: number | null
  estimatedDeliveryStartAt?: string | Date | null
  estimatedDeliveryEndAt?: string | Date | null
  isGuaranteed?: boolean | null
  isActive?: boolean | null
  description?: string | null
  transitHours?: number | null
  [key: string]: unknown
}

/** Unified.to ShippingRate response shape. */
export interface UnifiedShippingRate {
  id?: string | null
  carrierId?: string | null
  currency?: string | null
  shipmentId?: string | null
  rates?: UnifiedShippingRateRate[] | null
  raw?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformRate(raw: UnifiedShippingRate, rateEntry?: UnifiedShippingRateRate): Rate {
  const entry = rateEntry ?? (raw.rates ?? [])[0]

  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrierId ?? undefined,
    serviceCode: entry?.title ?? undefined,
    serviceName: entry?.title ?? undefined,
    currency: entry?.currency ?? raw.currency ?? undefined,
    totalAmount: entry?.amount ?? undefined,
    retailAmount: entry?.baseAmount ?? undefined,
    transitDays: entry?.deliveryDays ?? entry?.estimatedDays ?? undefined,
    deliveryDays: entry?.deliveryDays ?? entry?.estimatedDays ?? undefined,
    estimatedDeliveryAt: toISODate(entry?.estimatedDeliveryEndAt ?? entry?.estimatedDeliveryStartAt),
    isGuaranteedDelivery: entry?.isGuaranteed ?? undefined,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Expand a ShippingRate container into one Rate per rate entry.
 * If there are no nested rate entries, emit a single Rate from the container.
 */
export function expandRates(raw: UnifiedShippingRate): Rate[] {
  const entries = raw.rates ?? []
  if (entries.length === 0) {
    return [transformRate(raw)]
  }
  return entries.map((entry) => transformRate(raw, entry))
}
