import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Webshipper raw types ────────────────────────────────────────────────────

export interface WebshipperRateAttributes {
  service_code?: string | null
  service_name?: string | null
  carrier_id?: string | number | null
  currency?: string | null
  price?: number | string | null
  retail_price?: number | string | null
  transit_time?: number | string | null
  estimated_delivery_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export interface WebshipperRate {
  id?: string | number | null
  type?: string
  attributes?: WebshipperRateAttributes | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformRate(raw: WebshipperRate): Rate {
  const attrs = raw.attributes ?? {}

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    carrierId: attrs.carrier_id != null ? String(attrs.carrier_id) : 'webshipper',
    serviceCode: attrs.service_code ?? undefined,
    serviceName: attrs.service_name ?? undefined,
    currency: attrs.currency ?? undefined,
    totalAmount: parseDecimal(attrs.price),
    retailAmount: parseDecimal(attrs.retail_price ?? undefined),
    transitDays: parseDecimal(attrs.transit_time) ?? undefined,
    deliveryDays: parseDecimal(attrs.transit_time) ?? undefined,
    estimatedDeliveryAt: toISODate(attrs.estimated_delivery_at),
    createdAt: toISODate(attrs.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
