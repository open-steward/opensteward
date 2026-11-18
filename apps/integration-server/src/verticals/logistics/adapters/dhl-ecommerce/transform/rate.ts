import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

// ─── DHL eCommerce raw types ────────────────────────────────────────────────
// Source: POST /shipping/v4/products  (DHL eCommerce Americas Product Finder API v4)
// Response: array of product objects, each optionally containing rate + EDD info

export interface DhlEcommerceRateComponent {
  amount?: number | null
  type?: string | null
  description?: string | null
  [key: string]: unknown
}

export interface DhlEcommerceRateDetail {
  /** Total rate amount in the account's billing currency */
  amount?: number | null
  currency?: string | null
  rateComponents?: DhlEcommerceRateComponent[] | null
  [key: string]: unknown
}

export interface DhlEcommerceEstimatedDeliveryDate {
  deliveryDaysMin?: number | null
  deliveryDaysMax?: number | null
  /** ISO date string for earliest estimated delivery */
  estimatedDeliveryMin?: string | null
  /** ISO date string for latest estimated delivery */
  estimatedDeliveryMax?: string | null
  [key: string]: unknown
}

export interface DhlEcommerceProduct {
  /** Product/service code (e.g. "PLT" for DHL Parcel International) */
  orderedProductId?: string | null
  productName?: string | null
  description?: string | null
  trackingAvailable?: boolean | null
  rate?: DhlEcommerceRateDetail | null
  estimatedDeliveryDate?: DhlEcommerceEstimatedDeliveryDate | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: DhlEcommerceProduct): Rate {
  const edd = raw.estimatedDeliveryDate ?? null

  const transitDays =
    edd?.deliveryDaysMin != null
      ? Math.round(edd.deliveryDaysMin)
      : edd?.deliveryDaysMax != null
        ? Math.round(edd.deliveryDaysMax)
        : undefined

  const deliveryDays =
    edd?.deliveryDaysMax != null ? Math.round(edd.deliveryDaysMax) : transitDays

  const estimatedDeliveryAt = toISODate(edd?.estimatedDeliveryMin ?? edd?.estimatedDeliveryMax)

  return {
    carrierId: 'dhl-ecommerce',
    serviceCode: raw.orderedProductId ?? undefined,
    serviceName: raw.productName ?? raw.description ?? undefined,
    currency: (raw.rate?.currency as string | undefined) ?? undefined,
    totalAmount: raw.rate?.amount ?? undefined,
    transitDays,
    deliveryDays,
    estimatedDeliveryAt,
    isGuaranteedDelivery: false,
    metadata: raw as Record<string, unknown>,
  }
}
