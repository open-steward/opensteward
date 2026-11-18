import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/**
 * Raw Deliveroo quote as returned by POST /signature/v1/quotes.
 */
export interface DeliverooQuoteRaw {
  id?: string | null
  /** Fee in fractional currency units (pence / cents). */
  fee_fractional?: number | null
  currency?: string | null
  /** ISO-8601 estimated delivery time. */
  estimated_delivery_time?: string | null
  expires_at?: string | null
  restaurant_id?: string | null
  [key: string]: unknown
}

export function transformRate(raw: DeliverooQuoteRaw): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: 'deliveroo',
    serviceCode: 'deliveroo_courier',
    serviceName: 'Deliveroo Courier',
    currency:
      typeof raw.currency === 'string' && raw.currency.length === 3
        ? (raw.currency as string)
        : undefined,
    // fee_fractional is already in minor units (pence/cents)
    totalAmount: raw.fee_fractional != null ? raw.fee_fractional : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_time),
    metadata: raw as Record<string, unknown>,
  }
}
