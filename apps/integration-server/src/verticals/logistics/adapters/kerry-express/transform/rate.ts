import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Kerry Express raw types ──────────────────────────────────────────────

export interface KerryExpressRate {
  rate_id: string | null
  service_code: string | null
  service_name: string | null
  total: number | null
  currency: string | null
  transit_days: number | null
  estimated_delivery: string | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformRate(raw: KerryExpressRate): Rate {
  return {
    id: raw.rate_id ?? undefined,
    carrierId: 'kerry-express',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'THB',
    totalAmount: parseDecimal(raw.total),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
