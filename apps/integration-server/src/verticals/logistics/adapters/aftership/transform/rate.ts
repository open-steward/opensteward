import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

// AfterShip Shipping API (Postmen v3) — POST /rates (calculate), GET /rates/:id
// Docs: https://www.aftership.com/docs/shipping/f4353677b8ac1-calculate-rates
// Response wraps a rate object inside data.rate

export interface AfterShipCharge {
  amount: number
  currency: string
}

export interface AfterShipChargeWeight {
  value: number
  unit: string
}

export interface AfterShipShipperAccount {
  id: string
  slug: string | null
  description: string | null
}

export interface AfterShipRateObject {
  service_type: string | null
  service_name: string | null
  total_charge: AfterShipCharge | null
  transit_time: number | null
  delivery_date: string | null
  charge_weight: AfterShipChargeWeight | null
  shipper_account: AfterShipShipperAccount | null
  [key: string]: unknown
}

// Top-level rate resource returned from GET /rates or POST /rates
export interface AfterShipRate {
  id: string
  status: string
  rate: AfterShipRateObject | null
  created_at: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: AfterShipRate): Rate {
  const r = raw.rate

  const amount = parseDecimal(r?.total_charge?.amount)
  const currency = r?.total_charge?.currency

  return {
    id: raw.id,
    carrierId: r?.shipper_account?.slug ?? undefined,
    serviceCode: r?.service_type ?? undefined,
    serviceName: r?.service_name ?? undefined,
    currency: currency ?? undefined,
    totalAmount: amount !== undefined ? Math.round(amount * 100) : undefined,
    transitDays: r?.transit_time !== null && r?.transit_time !== undefined ? r.transit_time : undefined,
    deliveryDays: r?.transit_time !== null && r?.transit_time !== undefined ? r.transit_time : undefined,
    estimatedDeliveryAt: toISODate(r?.delivery_date),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
