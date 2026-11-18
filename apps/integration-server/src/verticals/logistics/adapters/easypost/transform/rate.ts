import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface EasyPostRate {
  id: string
  object: 'Rate'
  mode: string
  carrier: string
  carrier_account_id: string
  service: string
  rate: string          // decimal string, e.g. "9.25"
  currency: string
  retail_rate: string | null
  retail_currency: string | null
  list_rate: string | null
  list_currency: string | null
  delivery_days: number | null
  delivery_date: string | null
  delivery_date_guaranteed: boolean
  est_delivery_days: number | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function transformRate(raw: EasyPostRate): Rate {
  return {
    id: raw.id,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.rate),
    retailAmount: parseDecimal(raw.retail_rate ?? undefined),
    transitDays: raw.delivery_days ?? undefined,
    deliveryDays: raw.delivery_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    isGuaranteedDelivery: raw.delivery_date_guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
