import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'
import type {
  BpostProductConfigResponse,
  BpostProductConfigProduct,
  BpostProductConfigDeliveryMethod,
} from './carrier'

// bpost product configuration — GET /productconfig
// https://api.bpost.be/services/shm/{accountId}/productconfig
// Returns delivery methods each containing products with weight-tiered prices (in euro cents).
// Reference: tijsverkoyen/bpost-api-library src/Bpost/ProductConfiguration/Price.php

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Pick the price tier that matches a given weight in grams.
 * Tiers: <2 kg, 2–5 kg, 5–10 kg, 10–20 kg, 20–30 kg.
 */
function pickPrice(
  product: BpostProductConfigProduct,
  weightGrams: number,
): number | undefined {
  const prices = product.price ?? []
  const p = prices[0] // use first country price entry (default: BE)
  if (!p) return undefined

  if (weightGrams <= 2000) return p.priceLessThan2
  if (weightGrams <= 5000) return p.price2To5
  if (weightGrams <= 10000) return p.price5To10
  if (weightGrams <= 20000) return p.price10To20
  return p.price20To30
}

export function transformRates(
  raw: BpostProductConfigResponse,
  weightGrams = 0,
): Rate[] {
  const rates: Rate[] = []
  const now = toISODate(new Date().toISOString())

  for (const dm of (raw.deliveryMethod ?? []) as BpostProductConfigDeliveryMethod[]) {
    for (const product of dm.product ?? []) {
      if (!product.name) continue
      const serviceCode = slugify(product.name)
      const totalAmount = pickPrice(product, weightGrams)
      rates.push({
        carrierId: 'bpost',
        serviceCode,
        serviceName: product.name,
        currency: 'EUR',
        totalAmount: totalAmount ?? undefined,
        createdAt: now,
        metadata: { deliveryMethod: dm.name, ...product } as Record<string, unknown>,
      })
    }
  }

  return rates
}
