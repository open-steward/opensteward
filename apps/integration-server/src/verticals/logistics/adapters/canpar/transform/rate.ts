import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Canpar raw types ───────────────────────────────────────────────────────

export interface CanparRate {
  service_type?: string | null
  service_name?: string | null
  total?: number | null
  base_rate?: number | null
  currency?: string | null
  transit_days?: number | null
  estimated_delivery_date?: string | null
  guaranteed?: boolean | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: CanparRate): Rate {
  return {
    carrierId: 'canpar',
    serviceCode: raw.service_type ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: (raw.currency as Rate['currency']) ?? undefined,
    totalAmount: parseDecimal(raw.total) ?? undefined,
    retailAmount: parseDecimal(raw.base_rate) ?? undefined,
    transitDays: raw.transit_days != null ? Math.round(raw.transit_days) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
