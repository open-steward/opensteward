import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A single charge line returned by POST api.dhl.com/freight/info/pricequote/v1
 * (DHL Freight Price Quote API — 2026/R01 product manual).
 * The response is an array of charge objects; TotalPrice is the last item.
 */
export interface DhlFreightPriceQuoteCharge {
  description: string | null
  descriptionEng: string | null
  id: string | null
  sortOrder: number | null
  unit: string | null
  value: number | null
  [key: string]: unknown
}

/**
 * Top-level Price Quote response envelope.
 */
export interface DhlFreightPriceQuoteResponse {
  productCode: string | null
  currency: string | null
  plannedDeliveryDate: string | null
  transitDays: number | null
  charges: DhlFreightPriceQuoteCharge[]
  [key: string]: unknown
}

function extractTotal(charges: DhlFreightPriceQuoteCharge[]): number | undefined {
  // The final element is typically "TotalPrice"; fall back to summing FreightCost charges.
  const totalLine = charges.find(
    (c) => (c.id ?? '').toLowerCase().includes('totalprice') ||
            (c.descriptionEng ?? '').toLowerCase().includes('total'),
  )
  if (totalLine?.value != null) return parseDecimal(totalLine.value)

  const freightLine = charges.find(
    (c) => (c.id ?? '').toLowerCase().includes('freightcost'),
  )
  return freightLine ? parseDecimal(freightLine.value ?? undefined) : undefined
}

export function transformRate(raw: DhlFreightPriceQuoteResponse): Rate {
  const totalAmount = extractTotal(raw.charges ?? [])

  return {
    carrierId: 'dhl-freight',
    serviceCode: raw.productCode ?? undefined,
    serviceName: raw.productCode ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: totalAmount,
    transitDays: raw.transitDays != null ? Math.round(raw.transitDays) : undefined,
    estimatedDeliveryAt: toISODate(raw.plannedDeliveryDate),
    createdAt: new Date(),
    metadata: raw as Record<string, unknown>,
  }
}
