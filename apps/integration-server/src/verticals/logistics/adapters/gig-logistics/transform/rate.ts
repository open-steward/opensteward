import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'
import { GIG_DEFAULT_CURRENCY } from '../constants'

/**
 * Raw rate object from the GIG Logistics rate-enquiry endpoint.
 *
 * GIGL returns quoted delivery prices based on origin, destination, and weight.
 * The rate response typically includes a base price, insurance, and estimated
 * transit time in days.
 */
export interface GigRate {
  id?: string | null
  serviceCode?: string | null
  serviceName?: string | null
  carrier?: string | null
  currency?: string | null
  /** Base delivery price (in full currency units, e.g. NGN 1500). */
  price?: number | null
  /** Total price including VAT, insurance, and surcharges. */
  totalPrice?: number | null
  transitDays?: number | null
  estimatedDeliveryDate?: string | null
  isGuaranteed?: boolean | null
  createdAt?: string | null
  [key: string]: unknown
}

export function transformRate(raw: GigRate): Rate {
  const currency = raw.currency ?? GIG_DEFAULT_CURRENCY
  const total = parseDecimal(raw.totalPrice ?? raw.price)

  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier ?? 'gig-logistics',
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency,
    totalAmount: total,
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.isGuaranteed ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
