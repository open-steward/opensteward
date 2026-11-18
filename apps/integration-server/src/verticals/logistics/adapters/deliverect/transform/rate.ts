import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

// Deliverect dispatch validation / quote response
export interface DeliverectValidation {
  available?: boolean | null
  validationId?: string | null
  price?: number | null
  currency?: string | null
  /** ETAs object: { pickupTime, deliveryTime } */
  ETAs?: Record<string, unknown> | null
  courierName?: string | null
  [key: string]: unknown
}

export function transformRate(raw: DeliverectValidation): Rate {
  const eta = raw.ETAs as Record<string, unknown> | null | undefined
  const estimatedDeliveryAt =
    toISODate(eta?.deliveryTime ?? eta?.delivery_time)

  return {
    id: raw.validationId ?? undefined,
    carrierId: 'deliverect',
    serviceCode: 'deliverect_dispatch',
    serviceName: raw.courierName ?? 'Deliverect Dispatch',
    currency: (raw.currency as string | undefined) ?? undefined,
    totalAmount: raw.price != null ? raw.price : undefined,
    estimatedDeliveryAt: estimatedDeliveryAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
