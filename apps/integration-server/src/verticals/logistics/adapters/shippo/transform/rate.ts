import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ShippoServiceLevel {
  name: string | null
  token: string | null
  terms: string | null
  extended_token: string | null
  parent_servicelevel: { name: string | null; token: string | null } | null
}

export interface ShippoRate {
  object_id: string
  object_created: string
  object_updated: string
  object_owner: string
  amount: string
  currency: string
  amount_local: string
  currency_local: string
  provider: string
  servicelevel: ShippoServiceLevel
  carrier_account: string
  shipment: string
  estimated_days: number | null
  arrives_by: string | null
  duration_terms: string | null
  attributes: string[]
  messages: unknown[] | null
  test: boolean
  [key: string]: unknown
}

export function transformRate(raw: ShippoRate): Rate {
  return {
    id: raw.object_id,
    carrierId: raw.provider ?? undefined,
    serviceCode: raw.servicelevel?.token ?? undefined,
    serviceName: raw.servicelevel?.name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.amount),
    transitDays: raw.estimated_days ?? undefined,
    deliveryDays: raw.estimated_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.arrives_by),
    isGuaranteedDelivery: raw.arrives_by != null ? true : undefined,
    createdAt: toISODate(raw.object_created),
    metadata: raw as Record<string, unknown>,
  }
}
