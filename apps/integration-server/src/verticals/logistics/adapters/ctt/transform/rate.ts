import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── CTT raw types ─────────────────────────────────────────────────────────

export interface CttRate {
  service_code: string
  service_name: string | null
  currency: string
  total_amount: number
  estimated_delivery_days: number | null
  estimated_delivery_date: string | null
  guaranteed: boolean
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: CttRate): Rate {
  return {
    carrierId: 'ctt',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.total_amount),
    transitDays: parseDecimal(raw.estimated_delivery_days) !== undefined
      ? Math.round(parseDecimal(raw.estimated_delivery_days)!)
      : undefined,
    deliveryDays: parseDecimal(raw.estimated_delivery_days) !== undefined
      ? Math.round(parseDecimal(raw.estimated_delivery_days)!)
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
