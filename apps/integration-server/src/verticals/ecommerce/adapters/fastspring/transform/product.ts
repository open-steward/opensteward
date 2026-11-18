/**
 * FastSpring Product → canonical Product.
 *
 * FastSpring's "product" is itself a single purchasable SKU (subscription
 * plan or one-time item) — there is no separate variant resource, so we
 * synthesize a single default `ProductVariant` from the product's own
 * pricing, mirroring the convention other single-SKU adapters use.
 *
 * Raw shape combines the fields documented across:
 *  - https://developer.fastspring.com/reference/retrieve-a-product
 *  - https://developer.fastspring.com/reference/create-or-update-products
 *
 * `product` is FastSpring's path/id (e.g. `"premium-laptop"`) — already
 * lowercase-hyphenated in every documented example, but run through
 * `toSlug` defensively since the canonical `handle` field is a strict Slug.
 *
 * `visibility` isn't enum-documented publicly; FastSpring's own examples
 * only ever show `"public"`. We map that to ACTIVE and anything else
 * (`"test"`, `"unpublished"`, or absent) to DRAFT rather than guess at an
 * undocumented enum.
 */

import { toSlug } from '@opensteward/shared'
import type { Product, ProductStatus } from '../../../schema/product'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawFastSpringProductPricing {
  price?: Record<string, number>
  interval?: string
  intervalLength?: number
  trial?: number
  [key: string]: unknown
}

export interface RawFastSpringProduct {
  product: string
  parent?: string | null
  productAppReference?: string
  display?: Record<string, string>
  description?: {
    summary?: Record<string, string>
    action?: Record<string, string>
    full?: Record<string, string>
  }
  image?: string
  sku?: string
  visibility?: string
  quotable?: boolean
  pricing?: RawFastSpringProductPricing
  [key: string]: unknown
}

function pickCurrency(price: Record<string, number> | undefined): string | undefined {
  if (!price) return undefined
  if ('USD' in price) return 'USD'
  return Object.keys(price)[0]
}

function mapVisibility(visibility: string | undefined): ProductStatus | undefined {
  if (!visibility) return undefined
  return visibility === 'public' ? 'ACTIVE' : 'DRAFT'
}

export function transformProduct(raw: RawFastSpringProduct): Product {
  const currency = pickCurrency(raw.pricing?.price)
  const priceMajor = currency ? raw.pricing?.price?.[currency] : undefined

  return {
    id: raw.product,
    title: raw.display?.['en'] ?? raw.product,
    description: raw.description?.full?.['en'] ?? raw.description?.summary?.['en'],
    handle: toSlug(raw.product),
    status: mapVisibility(raw.visibility),
    images: raw.image ? [{ url: raw.image }] : undefined,
    variants:
      priceMajor != null && currency
        ? [
            {
              id: `${raw.product}:default`,
              productId: raw.product,
              sku: raw.sku || undefined,
              title: undefined,
              price: { amount: majorToMinor(priceMajor, currency), currency },
              metadata: {
                synthetic: true,
                reason: 'FastSpring products are single-SKU — there is no separate variant resource.',
              },
            },
          ]
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → FastSpring create/update body (`POST /products`, one entry of `products[]`). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.id) body['product'] = product.id
  if (product.title) body['display'] = { en: product.title }
  if (product.description) body['description'] = { summary: { en: product.description } }
  if (product.images && product.images.length > 0 && product.images[0]?.url) {
    body['image'] = product.images[0].url
  }
  const variant = product.variants?.[0]
  if (variant?.sku) body['sku'] = variant.sku
  if (variant?.price?.amount != null) {
    const currency = variant.price.currency
    body['pricing'] = { price: { [currency]: minorToMajor(variant.price.amount, currency) } }
  }
  return body
}
