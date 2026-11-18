import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

// ─── Raw KitchenHub quote type ───────────────────────────────────────────────

export interface KitchenHubQuote {
  id?: string | null
  delivery_id?: string | null
  provider?: string | null
  fee?: number | null
  currency?: string | null
  estimated_delivery_at?: string | null
  transit_minutes?: number | null
  created_at?: string | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformQuote(raw: KitchenHubQuote): Rate {
  const transitDays =
    raw.transit_minutes != null
      ? Math.ceil(raw.transit_minutes / (60 * 24))
      : undefined

  return {
    id: raw.id ?? raw.delivery_id ?? undefined,
    carrierId: raw.provider ?? 'kitchenhub',
    serviceCode: raw.provider ? `${raw.provider}_delivery` : 'kitchenhub_delivery',
    serviceName: raw.provider ?? 'KitchenHub Delivery',
    currency: (raw.currency as Rate['currency']) ?? undefined,
    totalAmount: raw.fee ?? undefined,
    transitDays,
    deliveryDays: transitDays,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
