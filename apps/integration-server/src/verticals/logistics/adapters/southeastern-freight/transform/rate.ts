/**
 * Transform SEFL rate quote API responses → canonical Rate[].
 *
 * SEFL rate quote REST endpoint:
 *   POST https://www.sefl.com/webconnect/ratequotes/rest/submitQuote
 *   (form-urlencoded body; JSON response)
 *
 * Response envelope (from SEFL rate quote docs):
 * {
 *   errorOccured: boolean | string
 *   errorMessage?: string
 *   quoteNumber?: string
 *   status?: string               // "ENT" | "RAT" | "UTR"
 *   pickupDate?: string
 *   custAccount?: string
 *   transitTime?: string | number // transit days
 *   rateQuote?: number | string   // total charge
 *   discountPercent?: number | string
 *   discountAmount?: number | string
 *   origCity?: string
 *   origState?: string
 *   origZip?: string
 *   destCity?: string
 *   destState?: string
 *   destZip?: string
 *   details?: Array<{
 *     typeCharge?: string
 *     description?: string
 *     weight?: number | string
 *     ratingClass?: string
 *     rate?: number | string
 *     charges?: number | string
 *   }>
 *   quoteType?: string
 * }
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

export interface SeflRateDetail {
  typeCharge?: string
  description?: string
  weight?: number | string
  ratingClass?: string
  rate?: number | string
  charges?: number | string
  [key: string]: unknown
}

export interface SeflRateResponse {
  errorOccured?: boolean | string
  errorMessage?: string
  quoteNumber?: string
  status?: string
  pickupDate?: string
  custAccount?: string
  transitTime?: number | string
  rateQuote?: number | string
  discountPercent?: number | string
  discountAmount?: number | string
  origCity?: string
  origState?: string
  origZip?: string
  destCity?: string
  destState?: string
  destZip?: string
  details?: SeflRateDetail[]
  quoteType?: string
  [key: string]: unknown
}

export function transformRate(raw: SeflRateResponse): Rate {
  const transitDays = parseDecimal(raw.transitTime)
  const totalAmount = parseDecimal(raw.rateQuote)

  // SEFL quotes are in USD
  const currency = 'USD'

  // Pick-up date → estimated delivery (pickupDate + transitDays)
  let estimatedDeliveryAt: Date | undefined
  const pickupDateStr = toIsoDatetime(raw.pickupDate) ?? undefined
  const pickupDate = pickupDateStr ? new Date(pickupDateStr) : undefined
  if (pickupDate && transitDays !== undefined) {
    const est = new Date(pickupDate)
    est.setDate(est.getDate() + Math.ceil(transitDays))
    estimatedDeliveryAt = est
  }

  return {
    id: raw.quoteNumber ?? undefined,
    carrierId: 'southeastern-freight',
    serviceCode: raw.quoteType ?? undefined,
    serviceName: raw.quoteType ? `SEFL ${raw.quoteType}` : 'SEFL LTL',
    currency,
    totalAmount: totalAmount ?? undefined,
    transitDays: transitDays !== undefined ? Math.ceil(transitDays) : undefined,
    estimatedDeliveryAt,
    isGuaranteedDelivery: false,
    createdAt: new Date(toIsoDatetime(new Date().toISOString())!),
    metadata: raw as Record<string, unknown>,
  }
}
