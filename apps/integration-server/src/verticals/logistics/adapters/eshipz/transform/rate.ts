import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A single rate entry from `POST /v2/services` → `data.rates[]`.
 */
export interface EshipzRate {
  vendor_id?: string | number | null
  slug?: string | null
  description?: string | null
  selected_service_type?: string | null
  /** Rate code — 200/201 indicates a usable rate */
  code?: number | null
  /** Total freight charge */
  total?: number | null
  freight_charge?: number | null
  estimated_delivery_days?: number | string | null
  expected_delivery_date?: string | null
  currency?: string | null
  [key: string]: unknown
}

/**
 * Top-level response from `POST /v2/services`.
 */
export interface EshipzServicesResponse {
  data?: {
    rates?: EshipzRate[] | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

export function transformRate(raw: EshipzRate): Rate {
  const amount = parseDecimal(raw.total ?? raw.freight_charge)
  const transitDays = parseDecimal(raw.estimated_delivery_days)

  return {
    id: raw.vendor_id != null ? String(raw.vendor_id) : undefined,
    carrierId: raw.slug ?? undefined,
    serviceCode: raw.selected_service_type ?? undefined,
    serviceName: raw.description ?? undefined,
    currency: raw.currency ?? 'INR',
    totalAmount: amount ?? undefined,
    transitDays: transitDays != null ? Math.ceil(transitDays) : undefined,
    estimatedDeliveryAt: toISODate(raw.expected_delivery_date),
    metadata: raw as Record<string, unknown>,
  }
}
