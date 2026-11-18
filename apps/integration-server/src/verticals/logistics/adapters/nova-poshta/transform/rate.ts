import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'
import { NOVA_POSHTA_CARRIER_ID } from '../constants'

/**
 * Nova Poshta rate/price calculation response from POST /shipments/calculate.
 */
export interface NovaPoshtaRate {
  serviceCode?: string | null
  serviceName?: string | null
  cost?: number | null
  deliveryCost?: number | null
  totalCost?: number | null
  currency?: string | null
  estimatedDeliveryDate?: string | null
  transitDays?: number | null
  deliveryDays?: number | null
  [key: string]: unknown
}

export function transformRate(raw: NovaPoshtaRate): Rate {
  const amount =
    parseDecimal(raw.totalCost ?? raw.cost ?? raw.deliveryCost)
  return {
    carrierId: NOVA_POSHTA_CARRIER_ID,
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? 'UAH',
    totalAmount: amount,
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.deliveryDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    metadata: raw as Record<string, unknown>,
  }
}
