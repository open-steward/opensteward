import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Parcel2Go quote/rate object.
 * Returned by POST /api/quote
 */
export interface Parcel2GoQuote {
  /** Unique carrier service slug used to place an order (e.g. "evri-parcelshop"). */
  Slug?: string | null
  CourierName?: string | null
  ServiceName?: string | null
  TotalPrice?: number | string | null
  /** Estimated delivery date string. */
  EstimatedDeliveryDate?: string | null
  CollectionType?: string | null
  /** Drop-off provider code (when CollectionType === "DropOff"). */
  DropOffProviderCode?: string | null
  /** Whether delivery date is guaranteed. */
  IsGuaranteed?: boolean | null
  /** Transit time in working days. */
  TransitDays?: number | null
  [key: string]: unknown
}

export function transformRate(raw: Parcel2GoQuote): Rate {
  return {
    id: raw.Slug ?? undefined,
    carrierId: raw.CourierName ?? undefined,
    serviceCode: raw.Slug ?? undefined,
    serviceName: raw.ServiceName ?? undefined,
    currency: 'GBP',
    totalAmount: parseDecimal(raw.TotalPrice),
    transitDays: raw.TransitDays ?? undefined,
    deliveryDays: raw.TransitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    isGuaranteedDelivery: raw.IsGuaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
