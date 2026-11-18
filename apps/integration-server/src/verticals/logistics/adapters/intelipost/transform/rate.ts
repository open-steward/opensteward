import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Intelipost raw types ────────────────────────────────────────────────────

/**
 * A single delivery option returned inside the content.delivery_options array
 * from POST /quote or POST /quote_by_product.
 *
 * Source: intelipost-api-php delivery_option.php model + magento2-quote Data.php
 */
export interface IntelipostDeliveryOption {
  delivery_method_id?: number | string | null
  delivery_method_name?: string | null
  delivery_method_type?: string | null
  logistic_provider_name?: string | null
  description?: string | null
  delivery_note?: string | null
  final_shipping_cost?: number | null
  provider_shipping_cost?: number | null
  delivery_estimate_business_days?: number | null
  /** ISO date string for the estimated delivery date */
  delivery_estimate_date_exact_iso?: string | null
  [key: string]: unknown
}

/**
 * Full quote response envelope.
 * content.delivery_options holds the rate options.
 */
export interface IntelipostQuoteResponse {
  status?: string | null
  content?: {
    delivery_options?: IntelipostDeliveryOption[] | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformDeliveryOptionToRate(raw: IntelipostDeliveryOption): Rate {
  const totalAmount = parseDecimal(raw.final_shipping_cost)
  const retailAmount = parseDecimal(raw.provider_shipping_cost)
  const transitDays =
    raw.delivery_estimate_business_days != null
      ? Math.round(Number(raw.delivery_estimate_business_days))
      : undefined

  return {
    id: raw.delivery_method_id != null ? String(raw.delivery_method_id) : undefined,
    carrierId: raw.logistic_provider_name ?? undefined,
    serviceCode:
      raw.delivery_method_id != null ? String(raw.delivery_method_id) : undefined,
    serviceName: raw.delivery_method_name ?? raw.description ?? undefined,
    currency: 'BRL',
    totalAmount: totalAmount ?? undefined,
    retailAmount: retailAmount ?? undefined,
    transitDays,
    estimatedDeliveryAt: toISODate(raw.delivery_estimate_date_exact_iso),
    deliveryDays: transitDays,
    metadata: raw as Record<string, unknown>,
  }
}
