/**
 * Toast Configuration API `MenuItem` → canonical Product.
 *
 * GET /config/v2/menuItems "Returns an array of `MenuItem` objects containing
 * information about the items and modifiers available from a restaurant."
 * https://doc.toasttab.com/openapi/configuration/operation/menuItemsGet/
 *
 * The documented `MenuItem` carries `guid`, `entityType`, `externalId`,
 * `name`, `calories`, `sku`, `plu`, `orderableOnline`, `visibility`, `type`,
 * `optionGroups`, `inheritOptionGroups`, `images` (`Image.url`),
 * `unitOfMeasure` and `inheritUnitOfMeasure`. It has no price, description or
 * timestamps, so the product carries no variant (a canonical variant requires
 * a price) and no dates; `sku` and `plu` stay in `metadata`.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Toast shapes ───────────────────────────────────────────────────────

export interface RawToastImage {
  /** "The web address of the image." */
  url?: string
}

export interface RawToastMenuItem {
  guid: string
  entityType?: string
  externalId?: string
  name?: string
  calories?: number
  sku?: string
  plu?: string
  /** Deprecated upstream; `YES` | `NO`. */
  orderableOnline?: string
  /** Deprecated upstream; `ALL` | `POS_ONLY` | `NONE`. */
  visibility?: string
  type?: string
  optionGroups?: Array<{ guid: string; entityType?: string; externalId?: string }>
  inheritOptionGroups?: boolean
  images?: RawToastImage[]
  unitOfMeasure?: string
  inheritUnitOfMeasure?: boolean
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * `visibility`: "ALL: Visible to everyone (servers and customers)",
 * "POS_ONLY: Only visible to servers", "NONE: Hidden from everyone".
 */
function mapStatus(visibility: string | undefined): ProductStatus | undefined {
  if (visibility === 'NONE') return 'ARCHIVED'
  if (visibility === 'ALL' || visibility === 'POS_ONLY') return 'ACTIVE'
  return undefined
}

/**
 * Decimal major units to integer minor units, assuming USD.
 *
 * Used only by the discount transform (out of this rebuild's scope). Menu
 * items, orders, payments and refunds take the restaurant's documented
 * `currencyCode` instead.
 */
export function toastPriceToDollars(amount: number | undefined): number {
  if (amount == null) return 0
  return majorToMinor(amount, 'USD')
}

export function mapImages(images: RawToastImage[] | undefined): Image[] | undefined {
  const out: Image[] = []
  for (const img of images ?? []) {
    if (img.url) out.push({ url: img.url, position: out.length })
  }
  return out.length > 0 ? out : undefined
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawToastMenuItem): Product {
  // "The name of the menu item as it appears in the Toast POS." The canonical
  // title is required and there is no other documented source for it.
  if (typeof raw.name !== 'string') throw new Error(`Toast menu item ${raw.guid} has no name`)
  return {
    id: raw.guid,
    title: raw.name,
    status: mapStatus(raw.visibility),
    images: mapImages(raw.images),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Toast menu item body for create/update. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const price = product.variants?.[0]?.price?.amount
  return {
    name: product.title,
    description: product.description,
    sku: product.handle ?? product.variants?.[0]?.sku,
    pricing: price != null ? { fixedPrice: price } : undefined,
    visibility: product.status === 'ARCHIVED' ? 'NONE' : 'ALL',
  }
}
