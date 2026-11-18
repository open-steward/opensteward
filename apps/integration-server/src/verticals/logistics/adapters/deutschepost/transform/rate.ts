import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

export interface DeutschePostProductPrice {
  productCode: string
  productName: string
  price?: number
  currency?: string
  deliveryTimeMin?: number
  deliveryTimeMax?: number
  [key: string]: unknown
}

export interface DeutschePostRatesResponse {
  products: DeutschePostProductPrice[]
  [key: string]: unknown
}

export function transformRate(raw: DeutschePostProductPrice): Rate {
  return {
    id: undefined,
    carrierId: 'deutschepost',
    serviceCode: raw.productCode ?? undefined,
    serviceName: raw.productName ?? undefined,
    currency: raw.currency ?? 'EUR',
    totalAmount: parseDecimal(raw.price),
    transitDays: raw.deliveryTimeMax,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
