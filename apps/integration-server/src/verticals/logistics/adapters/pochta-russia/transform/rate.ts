import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Pochta Rossii tariff calculation response.
 * From GET https://tariff.pochta.ru/tariff/v1/calculate
 */
export interface PochtaRussiaTariffResponse {
  id?: number | null
  name?: string | null
  ground?: {
    val?: number | null       // kopeks
    vat?: number | null       // kopeks
  } | null
  air?: {
    val?: number | null       // kopeks
    vat?: number | null       // kopeks
  } | null
  delivery?: {
    min?: number | null       // days
    max?: number | null       // days
  } | null
  date?: string | null        // estimated delivery date
  version?: string | null
  [key: string]: unknown
}

export function transformRate(raw: PochtaRussiaTariffResponse): Rate {
  // Use ground rate if available, fall back to air
  const groundVal = raw['ground']?.val
  const airVal = raw['air']?.val
  const rateVal = groundVal ?? airVal

  const deliveryMin = raw['delivery']?.min
  const deliveryMax = raw['delivery']?.max
  const transitDays =
    deliveryMin != null && deliveryMax != null
      ? Math.ceil((deliveryMin + deliveryMax) / 2)
      : (deliveryMin ?? deliveryMax ?? undefined)

  return {
    id: raw['id'] != null ? String(raw['id']) : undefined,
    carrierId: 'pochta-russia',
    serviceCode: raw['id'] != null ? String(raw['id']) : undefined,
    serviceName: raw['name'] ?? undefined,
    currency: 'RUB',
    // API returns kopeks — store as-is (minor units)
    totalAmount: parseDecimal(rateVal),
    transitDays: transitDays != null ? Math.round(transitDays) : undefined,
    deliveryDays: deliveryMax != null ? Math.round(deliveryMax) : undefined,
    estimatedDeliveryAt: toISODate(raw['date']),
    metadata: raw as Record<string, unknown>,
  }
}
