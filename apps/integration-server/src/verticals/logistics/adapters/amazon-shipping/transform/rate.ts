/**
 * Amazon Shipping v2 — rates (getRates) → canonical Rate.
 *
 * The getRates endpoint returns an array of `ServiceRate` objects, each
 * describing a billable carrier service option for the shipment request.
 * Money arrives as `{ value, unit }` where `unit` is an ISO-4217 code.
 *
 * Docs: https://developer-docs.amazon.com/sp-api/docs/shipping-api-v2-reference#getrates
 */
import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface AmazonRateMoney {
  value?: number | null
  unit?: string | null
}

export interface AmazonServiceRate {
  /** Amazon Shipping service identifier, e.g. `"Amazon Shipping Ground"`. */
  serviceId?: string | null
  /** Human-readable service name. */
  serviceName?: string | null
  /** Carrier identifier within the Amazon Shipping network. */
  carrierId?: string | null
  /** Total billable charge for the shipment. */
  totalCharge?: AmazonRateMoney | null
  /** Carrier's list price (before any discounts). */
  billableWeight?: AmazonRateMoney | null
  /** Promised delivery date (ISO-8601). */
  promiseDeliveryTime?: string | null
  /** Number of business transit days. */
  supportedDocumentSpecifications?: unknown
  requiresAdditionalInputs?: boolean
  /** Unique rate offer id. */
  rateId?: string | null
  [key: string]: unknown
}

export interface AmazonRatesResponse {
  payload?: {
    serviceRates?: AmazonServiceRate[]
    requestToken?: string | null
    [key: string]: unknown
  } | null
  serviceRates?: AmazonServiceRate[]
  [key: string]: unknown
}

export function transformRate(raw: AmazonServiceRate): Rate {
  const charge = raw.totalCharge
  const amount =
    charge?.value != null ? Math.round(charge.value * 100) : undefined
  const currency =
    typeof charge?.unit === 'string' && charge.unit.length === 3
      ? charge.unit.toUpperCase()
      : 'USD'

  return {
    id: raw.rateId ?? raw.serviceId ?? undefined,
    carrierId: raw.carrierId ?? 'amazon-shipping',
    serviceCode: raw.serviceId ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency,
    totalAmount: amount,
    estimatedDeliveryAt: toISODate(raw.promiseDeliveryTime),
    metadata: raw as Record<string, unknown>,
    createdAt: toISODate(undefined),
  }
}

export function extractRates(raw: AmazonRatesResponse): AmazonServiceRate[] {
  return raw.payload?.serviceRates ?? raw.serviceRates ?? []
}
