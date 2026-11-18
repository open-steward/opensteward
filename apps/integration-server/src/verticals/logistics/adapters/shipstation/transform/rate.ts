/**
 * ShipStation – Rate transform.
 *
 * ShipStation rate shopping is available via
 *   GET /shipments/getrates
 * which returns an array of service rates for a given shipment.
 *
 * Docs: https://www.shipstation.com/docs/api/shipments/get-rates/
 */

import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface SSRate {
  serviceName?: string | null
  serviceCode?: string | null
  carrierCode?: string | null
  carrierName?: string | null
  shipDate?: string | null
  deliveryDate?: string | null
  shipmentCost?: number | null
  otherCost?: number | null
  transitDays?: number | null
  [key: string]: unknown
}

export function transformRate(raw: SSRate): Rate {
  const baseCost = raw.shipmentCost ?? 0
  const otherCost = raw.otherCost ?? 0
  const totalCents = Math.round((baseCost + otherCost) * 100)

  return {
    carrierId: raw.carrierCode ?? raw.carrierName ?? undefined,
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: 'USD',
    totalAmount: totalCents > 0 ? totalCents : undefined,
    transitDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.deliveryDate),
    createdAt: toISODate(raw.shipDate),
    metadata: raw as Record<string, unknown>,
  }
}
