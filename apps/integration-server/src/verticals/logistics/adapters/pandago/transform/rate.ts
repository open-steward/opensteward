import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// ─── pandago raw types ─────────────────────────────────────────────────────

export interface PandagoFeeEstimate {
  estimated_delivery_fee?: number | null
  currency_code?: string | null
  distance?: number | null
  [key: string]: unknown
}

export interface PandagoTimeEstimate {
  estimated_pickup_time?: number | null
  estimated_delivery_time?: number | null
  delivery_duration?: number | null
  lower_bound?: number | null
  upper_bound?: number | null
  [key: string]: unknown
}

// ─── Combined estimate payload (fee + time merged by caller) ────────────────

export interface PandagoEstimate extends PandagoFeeEstimate, PandagoTimeEstimate {
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * pandago delivery estimates are provided via two separate endpoints:
 *   POST /orders/fee   → estimated_delivery_fee
 *   POST /orders/time  → estimated_pickup_time, estimated_delivery_time, delivery_duration
 *
 * The adapter calls both and merges the responses before calling this
 * transform. Graceful fallbacks are used for any missing field.
 */
export function transformRate(raw: PandagoEstimate): Rate {
  const deliveryAt =
    typeof raw.estimated_delivery_time === 'number'
      ? new Date(raw.estimated_delivery_time * 1000)
      : undefined

  return {
    carrierId: 'pandago',
    serviceCode: 'standard',
    serviceName: 'pandago On-Demand Delivery',
    currency: raw.currency_code ?? 'SGD',
    totalAmount: parseDecimal(raw.estimated_delivery_fee),
    transitDays: 0, // pandago is same-day / same-hour delivery
    estimatedDeliveryAt: deliveryAt,
    isGuaranteedDelivery: false,
    metadata: raw as Record<string, unknown>,
  }
}
