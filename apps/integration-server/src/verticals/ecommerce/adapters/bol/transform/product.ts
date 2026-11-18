/**
 * Bol.com Offer → canonical Product.
 *
 * Bol.com's Retailer API models products as "offers" — a retailer's listing
 * for a specific EAN (product). Each offer has pricing, stock, fulfilment
 * method, and condition info.
 *
 * Canonical `Product.id` = offer id (Bol.com's `offerId`).
 *
 * Bol.com docs: https://api.bol.com/retailer/public/Retailers-Offers.html
 */

import type { Product, ProductStatus } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawBolPrice {
  /** Bundle price set. */
  quantity: number
  unitPrice: number
}

export interface RawBolStock {
  amount: number
  managedByRetailer: boolean
}

export interface RawBolCondition {
  name?: string
  category?: string
  comment?: string
}

export interface RawBolFulfilment {
  method?: string // 'FBR' (retailer) | 'FBB' (Bol)
  deliveryCode?: string
}

export interface RawBolOffer {
  offerId: string
  ean?: string
  reference?: string
  onHoldByRetailer?: boolean
  unknownProductTitle?: string
  pricing?: {
    bundlePrices?: RawBolPrice[]
  }
  stock?: RawBolStock
  fulfilment?: RawBolFulfilment
  condition?: RawBolCondition
  notPublishableReasons?: Array<{ code?: string; description?: string }>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(raw: RawBolOffer): ProductStatus {
  if (raw.onHoldByRetailer) return 'ARCHIVED'
  if (raw.notPublishableReasons && raw.notPublishableReasons.length > 0) return 'DRAFT'
  return 'ACTIVE'
}

function extractUnitPrice(raw: RawBolOffer): number | undefined {
  const prices = raw.pricing?.bundlePrices
  if (!prices || prices.length === 0) return undefined
  // The first bundle price with quantity=1 is the single-unit price.
  const single = prices.find((p) => p.quantity === 1)
  return single?.unitPrice ?? prices[0]?.unitPrice
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawBolOffer): Product {
  const unitPrice = extractUnitPrice(raw)

  return {
    id: raw.offerId,
    title: raw.unknownProductTitle ?? raw.reference ?? raw.ean ?? raw.offerId,
    description: raw.condition?.comment ?? undefined,
    status: mapStatus(raw),
    vendor: undefined,
    productType: raw.fulfilment?.method === 'FBB' ? 'FBB' : 'FBR',
    variants: unitPrice != null
      ? [
          {
            id: raw.offerId,
            sku: raw.reference ?? raw.ean,
            barcode: raw.ean,
            price: { amount: majorToMinor(unitPrice, 'EUR'), currency: 'EUR' },
            metadata: {},
          },
        ]
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Bol.com create/update offer body.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  // EAN
  const ean =
    data.variants?.[0]?.barcode ??
    (data.metadata?.['ean'] as string | undefined)
  if (ean) body['ean'] = ean

  // Reference (retailer SKU)
  const reference =
    data.variants?.[0]?.sku ??
    (data.metadata?.['reference'] as string | undefined)
  if (reference) body['reference'] = reference

  // Condition
  const condName =
    (data.metadata?.['condition'] as Record<string, unknown> | undefined)?.['name'] ?? 'NEW'
  body['condition'] = { name: condName }

  // Pricing
  const price = data.variants?.[0]?.price
  if (price) {
    body['pricing'] = {
      // Canonical price is integer minor units; Bol.com expects a decimal major-unit value.
      bundlePrices: [{ quantity: 1, unitPrice: price.amount / 100 }],
    }
  }

  // Stock
  const stockAmount = data.metadata?.['stock'] as Record<string, unknown> | undefined
  if (stockAmount) {
    body['stock'] = stockAmount
  }

  // Fulfilment
  const fulfilment = data.metadata?.['fulfilment'] as Record<string, unknown> | undefined
  if (fulfilment) {
    body['fulfilment'] = fulfilment
  } else {
    body['fulfilment'] = { method: 'FBR', deliveryCode: '1-2d' }
  }

  return body
}
