/**
 * Brink Commerce Product / Variant → canonical.
 *
 * Brink Commerce separates products into two layers:
 *  - ProductParent: the catalog item (name, description, imageUrl, isActive, isArchived)
 *  - ProductVariant: a sellable SKU linked to a parent (productParentId)
 *
 * Prices and stock are stored on other services and are NOT embedded in
 * the product responses. A canonical ProductVariant requires a price, which
 * no documented variant field carries, so the read side refuses variants
 * (see listVariants/getVariant) and a Product is returned without them.
 * `transformProductVariant` below serves only the create/update write paths.
 *
 * Docs: https://docs.brinkcommerce.com/technical/api-references/management/product
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'

// ── Raw Brink Commerce shapes ────────────────────────────────────────────────

/**
 * `ProductParent` as `GET /product-parents/{productParentId}` returns it
 * (https://docs.brinkcommerce.com/technical/api-references/management/product/product-parents.md).
 * Required there: created, customAttributes, description, displayDescriptions,
 * displayNames, id, isActive, isArchived, name, updated. `tags` is documented
 * as deprecated: "Tags on Product Parent level are no longer used".
 */
export interface RawBrinkProductParent {
  id: string
  name: string
  displayNames?: Record<string, string>
  description?: string
  displayDescriptions?: Record<string, string>
  imageUrl?: string | null
  isActive?: boolean
  isArchived?: boolean
  customAttributes?: Record<string, unknown>
  created?: string
  updated?: string
  [key: string]: unknown
}

export interface RawBrinkProductVariant {
  id: string
  productParentId?: string
  name?: string
  displayNames?: Record<string, string>
  description?: string
  displayDescriptions?: Record<string, string>
  imageUrl?: string | null
  isActive?: boolean
  isArchived?: boolean
  taxGroupId?: string
  taxCode?: string
  tags?: Record<string, string[]>
  customAttributes?: Record<string, unknown>
  weight?: number
  dimensions?: {
    width?: number
    length?: number
    height?: number
  }
  shippingAttributes?: string[]
  priceUnitType?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(isActive?: boolean, isArchived?: boolean): ProductStatus | undefined {
  if (isArchived === true) return 'ARCHIVED'
  if (isActive === true) return 'ACTIVE'
  if (isActive === false) return 'DRAFT'
  return undefined
}

export function transformProduct(raw: RawBrinkProductParent): Product {
  return {
    id: raw.id,
    title: raw.name,
    description: raw.description || undefined,
    status: mapStatus(raw.isActive, raw.isArchived),
    images: raw.imageUrl ? [{ url: raw.imageUrl, alt: raw.name }] : undefined,
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProductVariant(raw: RawBrinkProductVariant): ProductVariant {
  return {
    id: raw.id,
    productId: raw.productParentId,
    title: raw.name,
    // Brink does not include price on the variant resource — set a zero
    // placeholder so the canonical shape is always valid. Real prices live
    // in the Price service and can be fetched separately.
    price: { amount: 0, currency: 'XXX' },
    weight: raw.weight,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Brink Commerce product-parent body (for PUT/PATCH). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    name: product.title,
    description: product.description,
    isActive: product.status === 'ACTIVE' ? true : product.status === 'DRAFT' ? false : undefined,
    imageUrl: product.images?.[0]?.url,
  }
}

/** Canonical ProductVariant → Brink Commerce product-variant body (for PUT/PATCH). */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    name: variant.title,
    productParentId: variant.productId,
    isActive: undefined,
    weight: variant.weight,
  }
}
