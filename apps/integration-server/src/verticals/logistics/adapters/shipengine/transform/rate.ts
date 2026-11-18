import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ShipEngineMonetaryValue {
  currency: string
  amount: number
}

export interface ShipEngineRate {
  rate_id: string
  rate_type: string
  carrier_id: string
  shipping_amount: ShipEngineMonetaryValue
  insurance_amount: ShipEngineMonetaryValue
  confirmation_amount: ShipEngineMonetaryValue
  other_amount: ShipEngineMonetaryValue
  tax_amount?: ShipEngineMonetaryValue | null
  zone?: number | null
  package_type?: string | null
  delivery_days?: number | null
  guaranteed_service?: boolean | null
  estimated_delivery_date?: string | null
  carrier_delivery_days?: string | null
  ship_date?: string | null
  negotiated_rate?: boolean | null
  service_type?: string | null
  service_code?: string | null
  trackable?: boolean | null
  carrier_code?: string | null
  carrier_nickname?: string | null
  carrier_friendly_name?: string | null
  validation_status?: string | null
  warning_messages?: string[]
  error_messages?: string[]
  [key: string]: unknown
}

export function transformRate(raw: ShipEngineRate): Rate {
  const totalAmount =
    (parseDecimal(raw.shipping_amount?.amount) ?? 0) +
    (parseDecimal(raw.insurance_amount?.amount) ?? 0) +
    (parseDecimal(raw.confirmation_amount?.amount) ?? 0) +
    (parseDecimal(raw.other_amount?.amount) ?? 0) +
    (parseDecimal(raw.tax_amount?.amount) ?? 0)

  return {
    id: raw.rate_id,
    carrierId: raw.carrier_id ?? raw.carrier_code ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_type ?? raw.carrier_friendly_name ?? undefined,
    currency: raw.shipping_amount?.currency ?? undefined,
    totalAmount: Math.round(totalAmount * 100),
    retailAmount: undefined,
    transitDays: raw.delivery_days ?? undefined,
    deliveryDays: raw.delivery_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    isGuaranteedDelivery: raw.guaranteed_service ?? undefined,
    createdAt: toISODate(raw.ship_date),
    metadata: raw as Record<string, unknown>,
  }
}
