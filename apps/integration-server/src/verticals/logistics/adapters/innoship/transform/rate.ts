import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

/**
 * Innoship rate/price object as returned by POST /api/Price.
 * The response has a "rates" array of these objects.
 */
export interface InnoshipRate {
  carrierId?: number | null
  carrier?: string | null
  serviceId?: number | null
  service?: string | null
  rateAmount?: number | null
  rateVatAmount?: number | null
  rateTotalAmount?: number | null
  rateCurrency?: string | null
  deliveryDays?: number | null
  calculatedDeliveryDate?: string | null
  score?: number | null
  performance?: number | null
  priority?: number | null
  [key: string]: unknown
}

export interface InnoshipPriceResponse {
  rates?: InnoshipRate[] | null
  [key: string]: unknown
}

export function transformRate(raw: InnoshipRate): Rate {
  const total = parseDecimal(raw.rateTotalAmount)
  const retail = parseDecimal(raw.rateAmount)

  return {
    id: raw.serviceId != null ? String(raw.serviceId) : undefined,
    carrierId: raw.carrierId != null ? String(raw.carrierId) : undefined,
    serviceCode: raw.serviceId != null ? String(raw.serviceId) : undefined,
    serviceName: raw.service ?? undefined,
    currency: raw.rateCurrency ?? undefined,
    totalAmount: total != null ? total : undefined,
    retailAmount: retail != null ? retail : undefined,
    transitDays: raw.deliveryDays != null ? raw.deliveryDays : undefined,
    deliveryDays: raw.deliveryDays != null ? raw.deliveryDays : undefined,
    estimatedDeliveryAt: toISODate(raw.calculatedDeliveryDate),
    metadata: raw as Record<string, unknown>,
  }
}
