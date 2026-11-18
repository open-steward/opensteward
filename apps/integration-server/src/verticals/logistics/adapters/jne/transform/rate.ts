/**
 * JNE fare/rate transform.
 *
 * JNE exposes shipping cost calculations via its pricedev endpoint.
 * The raw response contains an array of service options with pricing.
 */
import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface JneRateRaw {
  service_code?: string | null
  code?: string | null
  service_name?: string | null
  name?: string | null
  currency?: string | null
  total?: number | null
  amount?: number | null
  transit_days?: number | null
  etd?: string | null
  estimated_delivery?: string | null
  [key: string]: unknown
}

export function transformRate(raw: JneRateRaw): Rate {
  const totalAmount =
    typeof raw.total === 'number'
      ? raw.total
      : typeof raw.amount === 'number'
        ? raw.amount
        : undefined

  return {
    carrierId: 'jne',
    serviceCode: raw.service_code ?? raw.code ?? undefined,
    serviceName: raw.service_name ?? raw.name ?? undefined,
    currency: (raw.currency as string | undefined) ?? 'IDR',
    totalAmount,
    transitDays: typeof raw.transit_days === 'number' ? raw.transit_days : undefined,
    estimatedDeliveryAt: toISODate(raw.etd ?? raw.estimated_delivery),
    metadata: raw as Record<string, unknown>,
  }
}
