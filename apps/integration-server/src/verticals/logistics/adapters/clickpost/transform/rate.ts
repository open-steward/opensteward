import type { Rate } from '../../../schema/rate'

/** A single entry from the ClickPost recommendation API response */
export interface ClickPostRecommendation {
  courier_partner_id: number | null
  courier_name: string | null
  account_code: string | null
  priority: number | null
  estimated_delivery_days: number | null
  freight_charge: number | null
  [key: string]: unknown
}

/**
 * Transform a ClickPost recommendation entry into a canonical Rate.
 */
export function transformRate(raw: ClickPostRecommendation): Rate {
  const carrierId = raw.courier_partner_id != null ? String(raw.courier_partner_id) : undefined
  return {
    carrierId,
    serviceCode: raw.account_code ?? carrierId,
    serviceName: raw.courier_name ?? undefined,
    totalAmount: raw.freight_charge ?? undefined,
    transitDays: raw.estimated_delivery_days ?? undefined,
    deliveryDays: raw.estimated_delivery_days ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
