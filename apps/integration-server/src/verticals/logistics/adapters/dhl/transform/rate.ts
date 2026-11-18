import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface DHLTotalPrice {
  currencyType: string   // "BILLC" | "PULCL" | "BASEC"
  priceCurrency: string
  price: number
}

export interface DHLDeliveryCapabilities {
  estimatedDeliveryDateAndTime: string | null
  totalTransitDays: number | null
}

export interface DHLProduct {
  productName: string
  productCode: string
  localProductCode: string
  totalPrice: DHLTotalPrice[]
  deliveryCapabilities: DHLDeliveryCapabilities | null
  weight: { provided: number; unitOfMeasurement: string } | null
  [key: string]: unknown
}

export interface DHLRateResponse {
  products: DHLProduct[]
}

/**
 * Extract the billing-currency price entry (currencyType === "BILLC").
 * Falls back to the first entry if BILLC is not present.
 */
function billingPrice(prices: DHLTotalPrice[]): DHLTotalPrice | undefined {
  return prices.find((p) => p.currencyType === 'BILLC') ?? prices[0]
}

export function transformRate(raw: DHLProduct): Rate {
  const price = billingPrice(raw.totalPrice ?? [])
  const caps = raw.deliveryCapabilities

  return {
    id: raw.productCode,
    carrierId: 'dhl',
    serviceCode: raw.productCode ?? undefined,
    serviceName: raw.productName ?? undefined,
    currency: price?.priceCurrency ?? undefined,
    totalAmount: parseDecimal(price?.price),
    transitDays: caps?.totalTransitDays ?? undefined,
    deliveryDays: caps?.totalTransitDays ?? undefined,
    estimatedDeliveryAt: toISODate(caps?.estimatedDeliveryDateAndTime),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
