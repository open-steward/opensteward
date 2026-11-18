import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Singapore Post raw types ──────────────────────────────────────────────

export interface SingaporePostRate {
  service_code: string
  service_name: string
  currency: string
  total_amount: number
  transit_days: number | null
  estimated_delivery: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: SingaporePostRate): Rate {
  return {
    id: raw.service_code ?? undefined,
    carrierId: 'singapore-post',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.total_amount),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    metadata: raw as Record<string, unknown>,
  }
}
