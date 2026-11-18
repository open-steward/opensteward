import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'
import { BOXBERRY_CURRENCY } from '../constants'

/**
 * Raw Boxberry tariff calculation response from calcTariff.
 */
export interface BoxberryTariff {
  price?: string | number | null
  price_base?: string | number | null
  price_service?: string | number | null
  delivery_period?: string | number | null
  [key: string]: unknown
}

export function transformRate(raw: BoxberryTariff): Rate {
  const totalAmount = parseDecimal(raw.price)
  const retailAmount = parseDecimal(raw.price_base)
  const transitDays = raw.delivery_period !== null && raw.delivery_period !== undefined
    ? parseInt(String(raw.delivery_period), 10)
    : undefined

  // Estimated delivery date is not returned by calcTariff; use current time as
  // createdAt anchor only.
  const createdAt = toISODate(new Date().toISOString())

  return {
    carrierId: 'boxberry',
    serviceCode: 'boxberry_standard',
    serviceName: 'Boxberry Standard',
    currency: BOXBERRY_CURRENCY,
    totalAmount: totalAmount ?? undefined,
    retailAmount: retailAmount ?? undefined,
    transitDays: !isNaN(transitDays ?? NaN) ? transitDays : undefined,
    deliveryDays: !isNaN(transitDays ?? NaN) ? transitDays : undefined,
    createdAt,
    metadata: raw as Record<string, unknown>,
  }
}
