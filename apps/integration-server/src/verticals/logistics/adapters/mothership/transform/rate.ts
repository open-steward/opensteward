import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/**
 * A single rate object from the Mothership `POST /quotes` response.
 * `price` is a USD float (e.g. 79.5), NOT cents.
 * `transitDays` is an object with `minimum` and `maximum` float fields.
 */
export interface MothershipRateResponse {
  id?: string
  /** Carrier / provider name (e.g. "SAIA", "ESTES"). */
  provider?: string
  /** SCAC code for the carrier. */
  providerScac?: string
  /** Array of service/accessorial names. */
  services?: string[]
  /** USD float total price. */
  price?: number
  /** Transit days range. */
  transitDays?: {
    minimum?: number
    maximum?: number
    [key: string]: unknown
  }
  estimatedPickupDate?: string
  estimatedDeliveryDate?: string
  [key: string]: unknown
}

/**
 * Top-level response from `POST /quotes`.
 * The quote ID lives at the root `id` field.
 */
export interface MothershipQuoteResponse {
  id?: string
  rates?: MothershipRateResponse[]
  data?: {
    id?: string
    rates?: MothershipRateResponse[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformRate(raw: MothershipRateResponse, quoteId?: string): Rate {
  const transitMin =
    typeof raw.transitDays?.minimum === 'number' ? Math.round(raw.transitDays.minimum) : undefined
  const transitMax =
    typeof raw.transitDays?.maximum === 'number' ? Math.round(raw.transitDays.maximum) : undefined

  // Use average of min/max for single transitDays field; fall back to min
  const transitDays =
    transitMin !== undefined && transitMax !== undefined
      ? Math.ceil((transitMin + transitMax) / 2)
      : (transitMin ?? transitMax)

  return {
    id: raw.id ?? quoteId ?? undefined,
    carrierId: raw.providerScac ?? raw.provider ?? 'mothership',
    serviceCode: raw.providerScac ?? undefined,
    serviceName: raw.provider ?? undefined,
    currency: 'USD',
    // Price is a USD float; convert to cents integer for canonical Amount
    totalAmount: typeof raw.price === 'number' ? Math.round(raw.price * 100) : undefined,
    transitDays,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function unwrapQuote(
  res: MothershipQuoteResponse,
): { quoteId: string | undefined; rates: MothershipRateResponse[] } {
  const inner = res.data ?? res
  return {
    quoteId: inner.id ?? undefined,
    rates: inner.rates ?? [],
  }
}
