import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface SeraRateCostDetail {
  fee_code: string
  fee_type: string
  amount: number
}

export interface SeraShipmentCost {
  total_amount: number
  currency: string
  cost_details?: SeraRateCostDetail[]
}

export interface SeraRate {
  carrier: string
  service_type: string
  packaging_type: string | null
  estimated_delivery_days: string | null
  estimated_delivery_date: string | null
  is_guaranteed_service: boolean
  trackable: string | null
  shipment_cost: SeraShipmentCost
  [key: string]: unknown
}

export function transformRate(raw: SeraRate): Rate {
  return {
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    serviceName: raw.service_type?.replace(/_/g, ' ') ?? undefined,
    currency: raw.shipment_cost?.currency ?? undefined,
    totalAmount: parseDecimal(raw.shipment_cost?.total_amount),
    transitDays: parseDecimal(raw.estimated_delivery_days) !== undefined
      ? Math.round(parseDecimal(raw.estimated_delivery_days)!)
      : undefined,
    deliveryDays: parseDecimal(raw.estimated_delivery_days) !== undefined
      ? Math.round(parseDecimal(raw.estimated_delivery_days)!)
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    isGuaranteedDelivery: raw.is_guaranteed_service ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
