import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/**
 * Skydropx quotation rate object (returned by POST /quotations).
 */
export interface SkydropxQuotationRate {
  amount_local?: number | null
  currency_local?: string | null
  provider?: string | null
  service_level_name?: string | null
  service_level_code?: string | null
  days?: number | null
  insurable?: boolean | null
  out_of_area_service?: boolean | null
  out_of_area_pricing?: number | null
  total_pricing?: number | null
  is_occure?: boolean | null
  [key: string]: unknown
}

/**
 * Skydropx rate resource from shipment included (JSON:API).
 */
export interface SkydropxRateJsonApi {
  id?: string
  type?: string
  attributes?: SkydropxQuotationRate
  created_at?: string | null
  [key: string]: unknown
}

export function transformQuotationRate(raw: SkydropxQuotationRate): Rate {
  return {
    carrierId: raw.provider ?? undefined,
    serviceCode: raw.service_level_code ?? undefined,
    serviceName: raw.service_level_name ?? undefined,
    currency: raw.currency_local ?? undefined,
    totalAmount: raw.total_pricing ?? undefined,
    retailAmount: raw.amount_local ?? undefined,
    transitDays: raw.days ?? undefined,
    deliveryDays: raw.days ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRateJsonApi(raw: SkydropxRateJsonApi): Rate {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id ?? undefined,
    carrierId: attrs.provider ?? undefined,
    serviceCode: attrs.service_level_code ?? undefined,
    serviceName: attrs.service_level_name ?? undefined,
    currency: attrs.currency_local ?? undefined,
    totalAmount: attrs.total_pricing ?? undefined,
    retailAmount: attrs.amount_local ?? undefined,
    transitDays: attrs.days ?? undefined,
    deliveryDays: attrs.days ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
