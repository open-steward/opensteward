import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

export interface McfFee {
  name?: string | null
  amount?: {
    currencyCode?: string | null
    value?: number | string | null
  } | null
  [key: string]: unknown
}

export interface McfFulfillmentPreviewShipment {
  earliestDeliveryDate?: string | null
  latestDeliveryDate?: string | null
  earliestShipDate?: string | null
  latestShipDate?: string | null
  [key: string]: unknown
}

export interface McfFulfillmentPreview {
  shippingSpeedCategory?: string | null
  isFulfillable?: boolean | null
  estimatedFees?: McfFee[] | null
  fulfillmentPreviewShipments?: McfFulfillmentPreviewShipment[] | null
  marketplaceId?: string | null
  [key: string]: unknown
}

export interface McfFulfillmentPreviewResponse {
  payload?: {
    fulfillmentPreviews?: McfFulfillmentPreview[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Sum all fees for a preview to produce a total amount in minor units (cents).
 * MCF fee amounts are in decimal currency units (e.g. 12.50 USD).
 * The canonical Rate.totalAmount field is an integer in minor units.
 */
function sumFeesToMinorUnits(fees: McfFee[] | null | undefined): number | undefined {
  if (!fees || fees.length === 0) return undefined
  let total = 0
  for (const fee of fees) {
    const v = parseDecimal(fee.amount?.value)
    if (v !== undefined) total += v
  }
  return Math.round(total * 100)
}

function firstCurrency(fees: McfFee[] | null | undefined): string | undefined {
  if (!fees) return undefined
  for (const fee of fees) {
    const c = fee.amount?.currencyCode
    if (c) return c
  }
  return undefined
}

export function transformFulfillmentPreview(raw: McfFulfillmentPreview): Rate {
  const firstShipment = raw.fulfillmentPreviewShipments?.[0]
  const deliveryAt = toISODate(firstShipment?.latestDeliveryDate)
  const earliestAt = toISODate(firstShipment?.earliestDeliveryDate)
  const shipAt = toISODate(firstShipment?.earliestShipDate)

  // Estimate transit days from earliest ship date to earliest delivery date
  let transitDays: number | undefined
  if (shipAt && earliestAt) {
    const diffMs = earliestAt.getTime() - shipAt.getTime()
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
    if (days >= 0) transitDays = days
  }

  const totalAmount = sumFeesToMinorUnits(raw.estimatedFees ?? null)
  const currency = firstCurrency(raw.estimatedFees ?? null)

  return {
    serviceCode: raw.shippingSpeedCategory ?? undefined,
    serviceName: raw.shippingSpeedCategory ?? undefined,
    carrierId: 'amazon-mcf',
    currency: currency as Rate['currency'],
    totalAmount,
    transitDays,
    estimatedDeliveryAt: deliveryAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformFulfillmentPreviews(raw: McfFulfillmentPreviewResponse): Rate[] {
  const previews = raw.payload?.fulfillmentPreviews ?? []
  return previews
    .filter((p) => p.isFulfillable !== false)
    .map(transformFulfillmentPreview)
}
