/**
 * Shuup Product → canonical Product.
 *
 * Shuup stores translatable text fields (name, description) as objects keyed
 * by language code, e.g. `{ "en": "Product Name", "fi": "Tuotteen nimi" }`.
 * The helper `pickTranslation` extracts the English value first, then falls
 * back to the first available language.
 *
 * Shuup separates the base product (metadata, SKU, mode) from shop-specific
 * listings (`shop_product`) that carry price and stock. This adapter works
 * with the base product object. Status is derived from the `status` field
 * (1 = Published/Active, anything else = Draft).
 *
 * A single synthetic variant is synthesized from the product so downstream
 * code can always iterate `product.variants`.
 */

import type { Product, ProductVariant } from '../../../schema/product'

// ── Raw Shuup shapes ─────────────────────────────────────────────────────────

/** Translatable string field — either a language map or a plain string. */
export type ShuupTranslated = Record<string, string> | string | null | undefined

export interface ShuupProduct {
  id: number | string
  name?: ShuupTranslated
  description?: ShuupTranslated
  sku?: string | null
  /** 1 = normal/physical, other values are service/digital modes. */
  mode?: number | null
  shipping_mode?: number | null
  sales_unit?: number | string | null
  tax_class?: number | string | null
  /** 1 = Published (Active), other = inactive. */
  status?: number | null
  /** Width in cm (not always present). */
  width?: number | null
  /** Height in cm. */
  height?: number | null
  /** Depth in cm. */
  depth?: number | null
  /** Net weight in kg. */
  net_weight?: number | null
  gross_weight?: number | null
  created_on?: string | null
  modified_on?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the best string value from a Shuup translated field.
 * Prefers English ('en'), then falls back to the first value in the map.
 */
export function pickTranslation(field: ShuupTranslated): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field['en'] ?? Object.values(field)[0] ?? ''
}

export function transformProduct(raw: ShuupProduct): Product {
  const productId = String(raw.id)
  const title = pickTranslation(raw.name) || productId
  const description = raw.description ? pickTranslation(raw.description) : undefined

  const isActive = raw.status === 1
  const weight = raw.net_weight ?? raw.gross_weight ?? undefined

  const variant: ProductVariant = {
    id: `${productId}:default`,
    productId,
    sku: raw.sku ?? undefined,
    price: { amount: 0, currency: 'USD' },
    weight: weight != null ? weight : undefined,
    weightUnit: weight != null ? 'kg' : undefined,
    inventoryItemId: productId,
    metadata: {
      synthetic: true,
      reason: 'Shuup product mapped to single canonical variant; price comes from shop_product',
      parentProductId: productId,
    },
  }

  return {
    id: productId,
    title,
    description: description || undefined,
    status: isActive ? 'ACTIVE' : 'DRAFT',
    variants: [variant],
    createdAt: raw.created_on ?? undefined,
    updatedAt: raw.modified_on ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Shuup product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (product.title != null) {
    body['name'] = { en: product.title }
  }
  if (product.description != null) {
    body['description'] = { en: product.description }
  }

  // Shuup status: 1 = published, 2 = draft/hidden
  if (product.status != null) {
    body['status'] = product.status === 'ACTIVE' ? 1 : 2
  }

  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    if (v.sku) body['sku'] = v.sku
    if (v.weight != null) body['net_weight'] = v.weight
  }

  return body
}
