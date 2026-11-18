import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Pirate Ship raw types ─────────────────────────────────────────────────

export interface PirateShipRate {
  rate_id: string | null
  service_code: string | null
  service_name: string | null
  total_amount: number | null
  currency: string | null
  transit_days: number | null
  estimated_delivery_at: string | null
  guaranteed: boolean | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: PirateShipRate): Rate {
  return {
    id: raw.rate_id ?? undefined,
    carrierId: 'pirateship',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.total_amount),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
