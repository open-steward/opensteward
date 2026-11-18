/**
 * Oracle Transportation Management (OTM) Rate and Route → canonical Rate.
 *
 * OTM provides rate results via the Rate Inquiry custom action:
 *   POST /custom-actions/riqRateAndRoute  (internal API path)
 *
 * Response key: rateAndRouteResponse[] — each element is one rate option.
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/transportation/26a/otmra/rate-inquiry.html
 */

import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface OracleOtmAmountValue {
  value?: string | number
  currency?: string
}

export interface OracleOtmTransitTime {
  amount?: string | number
  /** "H" = hours, "D" = days */
  type?: string
}

export interface OracleOtmGidRef {
  servprovGid?: string
  servprovXid?: string
  [key: string]: unknown
}

export interface OracleOtmRateAndRouteResult {
  totalActualCost?: OracleOtmAmountValue
  totalWeightedCost?: OracleOtmAmountValue
  retailCost?: OracleOtmAmountValue
  serviceProvider?: OracleOtmGidRef
  transportMode?: { transportModeGid?: string }
  transitTime?: OracleOtmTransitTime
  endTime?: { value?: string }
  itinerary?: { itineraryGid?: string; itineraryXid?: string }
  [key: string]: unknown
}

export interface OracleOtmRateAndRouteResponse {
  rateAndRouteResponse?: OracleOtmRateAndRouteResult[]
  [key: string]: unknown
}

function parseAmount(val: OracleOtmAmountValue | undefined): number | undefined {
  if (!val?.value) return undefined
  const n = typeof val.value === 'number' ? val.value : parseFloat(String(val.value))
  if (isNaN(n)) return undefined
  return Math.round(n * 100)
}

function parseTransitDays(t: OracleOtmTransitTime | undefined): number | undefined {
  if (!t?.amount) return undefined
  const hours = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount))
  if (isNaN(hours)) return undefined
  if (t.type === 'H') return Math.ceil(hours / 24)
  // type "D" or unspecified
  return Math.ceil(hours)
}

export function transformRate(raw: OracleOtmRateAndRouteResult): Rate {
  const servprovGid = raw.serviceProvider?.servprovGid
  // GID format is "DOMAIN.CODE" — use the XID (human-readable) or strip prefix
  const servprovXid = raw.serviceProvider?.servprovXid
  const carrierId = servprovGid
    ? (servprovGid.includes('.') ? servprovGid.split('.').slice(1).join('.') : servprovGid)
    : undefined

  const modeGid = raw.transportMode?.transportModeGid
  const modeCode = modeGid
    ? (modeGid.includes('.') ? modeGid.split('.').slice(1).join('.') : modeGid)
    : undefined

  const itinGid = raw.itinerary?.itineraryGid
  const serviceCode = raw.itinerary?.itineraryXid
    ?? (itinGid?.includes('.') ? itinGid.split('.').slice(1).join('.') : itinGid)
    ?? modeCode

  const cost = raw.totalActualCost ?? raw.totalWeightedCost
  const currency = cost?.currency ?? raw.retailCost?.currency ?? undefined

  const transitDays = parseTransitDays(raw.transitTime)
  const estimatedDeliveryAt = toISODate(raw.endTime?.value)

  return {
    carrierId: carrierId ?? servprovXid ?? undefined,
    serviceCode,
    serviceName: serviceCode,
    currency: currency as Rate['currency'],
    totalAmount: parseAmount(cost),
    retailAmount: parseAmount(raw.retailCost),
    transitDays,
    estimatedDeliveryAt,
    deliveryDays: transitDays,
    metadata: raw as Record<string, unknown>,
  }
}
