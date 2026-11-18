import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * iMile rate / pricing object returned by the rate-query endpoint.
 */
export interface IMileRate {
  /** iMile service type code. */
  serviceType?: string | null
  /** Human-readable service name. */
  serviceName?: string | null
  /** Shipping fee in the specified currency. */
  freight?: number | string | null
  currency?: string | null
  /** Estimated transit time in days. */
  transitDays?: number | string | null
  /** Estimated delivery date (ISO-8601). */
  estimatedDeliveryDate?: string | null
  createdTime?: string | null
  [key: string]: unknown
}

export function transformRate(raw: IMileRate): Rate {
  return {
    id: raw.serviceType ?? undefined,
    carrierId: 'imile',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.freight),
    transitDays:
      raw.transitDays != null ? Math.round(parseDecimal(raw.transitDays) ?? 0) : undefined,
    deliveryDays:
      raw.transitDays != null ? Math.round(parseDecimal(raw.transitDays) ?? 0) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: toISODate(raw.createdTime),
    metadata: raw as Record<string, unknown>,
  }
}
