import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A single evaluated service method returned in a carrier selection response
 * when `includeEvaluatedServiceMethodsInResponse: true`.
 */
export interface ShipiumEvaluatedServiceMethod {
  carrierSelectionId?: string | null
  carrier?: string | null
  serviceMethodName?: string | null
  serviceMethodCode?: string | null
  totalCost?: number | null
  currencyCode?: string | null
  transitDays?: number | null
  estimatedDeliveryDate?: string | null
  [key: string]: unknown
}

export function transformEvaluatedServiceMethod(raw: ShipiumEvaluatedServiceMethod): Rate {
  return {
    id: raw.carrierSelectionId ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.serviceMethodCode ?? raw.serviceMethodName ?? undefined,
    currency: (raw.currencyCode ?? 'USD').toUpperCase(),
    // Shipium totalCost is a decimal dollar amount — convert to minor units (cents)
    totalAmount: raw.totalCost !== undefined && raw.totalCost !== null
      ? Math.round((parseDecimal(raw.totalCost) ?? 0) * 100)
      : undefined,
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    metadata: raw as Record<string, unknown>,
  }
}
