import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

// ─── Bring raw types ────────────────────────────────────────────────────────

export interface BringProductPrice {
  amountWithVAT?: string | null
  amountWithoutVAT?: string | null
  currencyCode?: string | null
  [key: string]: unknown
}

export interface BringProductListPrice {
  priceWithoutAdditionalServices?: BringProductPrice | null
  priceWithAdditionalServices?: BringProductPrice | null
  [key: string]: unknown
}

export interface BringProductGuiInformation {
  displayName?: string | null
  productName?: string | null
  [key: string]: unknown
}

export interface BringProductExpectedDelivery {
  expectedDeliveryDate?: string | null
  workingDays?: number | null
  [key: string]: unknown
}

export interface BringProduct {
  id?: string | null
  guiInformation?: BringProductGuiInformation | null
  price?: {
    listPrice?: BringProductListPrice | null
    [key: string]: unknown
  } | null
  expectedDelivery?: BringProductExpectedDelivery | null
  [key: string]: unknown
}

export interface BringShippingGuideConsignment {
  products?: BringProduct[]
  [key: string]: unknown
}

export interface BringShippingGuideResponse {
  consignments?: BringShippingGuideConsignment[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: BringProduct): Rate {
  const listPrice = raw.price?.listPrice
  const priceObj = listPrice?.priceWithoutAdditionalServices

  const amountStr = priceObj?.amountWithVAT ?? priceObj?.amountWithoutVAT
  const totalAmount =
    amountStr != null && amountStr !== '' ? parseFloat(amountStr) : undefined
  const currency = priceObj?.currencyCode ?? undefined

  const deliveryDate = raw.expectedDelivery?.expectedDeliveryDate
  const estimatedDeliveryAt = toISODate(deliveryDate)

  const workingDays = raw.expectedDelivery?.workingDays
  const transitDays =
    typeof workingDays === 'number' ? workingDays : undefined

  return {
    id: raw.id ?? undefined,
    carrierId: 'bring',
    serviceCode: raw.id ?? undefined,
    serviceName:
      raw.guiInformation?.displayName ??
      raw.guiInformation?.productName ??
      undefined,
    currency: currency as Rate['currency'],
    totalAmount: totalAmount ?? null,
    transitDays,
    estimatedDeliveryAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRates(raw: BringShippingGuideResponse): Rate[] {
  const rates: Rate[] = []
  for (const consignment of raw.consignments ?? []) {
    for (const product of consignment.products ?? []) {
      rates.push(transformRate(product))
    }
  }
  return rates
}
