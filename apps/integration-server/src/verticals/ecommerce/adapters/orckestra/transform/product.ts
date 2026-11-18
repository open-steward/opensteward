/**
 * Orckestra Product → canonical Product + ProductVariant.
 *
 * Orckestra products have a flat shape with a single SKU per product
 * (no native variant tree). We surface each product as a canonical
 * `Product` with a single `ProductVariant` derived from the same
 * object (reusing the product id as the variant id with a `-v1` suffix).
 *
 * Key field mappings:
 *  - `Id`                    → `id` / variant `id`
 *  - `DisplayName`           → `title` (string or LocalizedString map)
 *  - `Description`           → `description`
 *  - `ListPrice`             → variant `compareAtPrice`
 *  - `CurrentPrice`          → variant `price`
 *  - `Sku`                   → variant `sku`
 *  - `IsActive`              → `status` (ACTIVE | DRAFT)
 *  - `PrimaryParentCategoryId` → `productType`
 *  - `PropertyBag`           → carried in `metadata` only
 *
 * `metadata` is always the complete raw Orckestra product object.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawOrckestraProduct {
  Id: string
  DisplayName?: string | Record<string, string>
  Description?: string | Record<string, string>
  ListPrice?: number | null
  CurrentPrice?: number | null
  Sku?: string | null
  IsActive?: boolean
  PrimaryParentCategoryId?: string | null
  PropertyBag?: Record<string, unknown>
  Currency?: string | null
  ImageUrl?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve a DisplayName / Description that may be either a plain string
 * or a locale-keyed map. Falls back to the first available value.
 */
export function pickString(
  value: string | Record<string, string> | undefined | null,
  locale = 'en-US',
): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? Object.values(value)[0] ?? ''
}

/** Build a canonical Money object from an Orckestra price number. */
function toMoney(amount: number | null | undefined, currency: string): Money | undefined {
  if (amount == null) return undefined
  return { amount: majorToMinor(amount, currency), currency }
}

/** Map Orckestra IsActive to canonical ProductStatus. */
function toProductStatus(isActive: boolean | undefined): ProductStatus {
  return isActive === false ? 'DRAFT' : 'ACTIVE'
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a raw Orckestra product into a canonical Product.
 * A single ProductVariant is synthesised from the product's price/SKU fields.
 */
export function transformProduct(raw: RawOrckestraProduct): Product {
  const currency = (raw.Currency as string | undefined | null) ?? DEFAULT_CURRENCY
  const title = pickString(raw.DisplayName) || raw.Id
  const price = toMoney(raw.CurrentPrice, currency)
  const compareAtPrice = toMoney(raw.ListPrice, currency)

  const variant: ProductVariant = {
    id: `${raw.Id}-v1`,
    productId: raw.Id,
    sku: raw.Sku ?? undefined,
    title,
    price: price ?? { amount: 0, currency },
    compareAtPrice,
    metadata: { raw },
  }

  const product: Product = {
    id: raw.Id,
    title,
    description: pickString(raw.Description) || undefined,
    status: toProductStatus(raw.IsActive),
    productType: raw.PrimaryParentCategoryId ?? undefined,
    variants: [variant],
    images:
      raw.ImageUrl
        ? [{ url: raw.ImageUrl as string }]
        : undefined,
    createdAt: raw.CreatedDate ?? undefined,
    updatedAt: raw.LastModifiedDate ?? undefined,
    metadata: { raw },
  }

  return product
}

/**
 * Transform a raw Orckestra product into a canonical ProductVariant.
 * Useful when the caller only needs the variant shape (e.g. listVariants).
 */
export function transformProductVariant(raw: RawOrckestraProduct): ProductVariant {
  const currency = (raw.Currency as string | undefined | null) ?? DEFAULT_CURRENCY
  const title = pickString(raw.DisplayName) || raw.Id
  const price = toMoney(raw.CurrentPrice, currency)
  const compareAtPrice = toMoney(raw.ListPrice, currency)

  return {
    id: `${raw.Id}-v1`,
    productId: raw.Id,
    sku: raw.Sku ?? undefined,
    title,
    price: price ?? { amount: 0, currency },
    compareAtPrice,
    metadata: { raw },
  }
}
