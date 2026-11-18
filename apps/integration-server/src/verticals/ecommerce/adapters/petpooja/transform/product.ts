/**
 * Petpooja menu item → canonical Product / ProductVariant.
 *
 * Petpooja models its menu as items (products) with optional variations
 * (variants). Each item belongs to one category. Pricing is in the restaurant's
 * local currency (INR for India-based restaurants). The API returns prices as
 * decimal major-unit strings (e.g. "149.00"), which we convert to integer
 * minor units (paise).
 *
 * Petpooja item fields:
 *   itemid, itemname, item_categoryid, item_description, item_image_url,
 *   item_type (1=veg, 2=non-veg, 3=egg), active (0/1),
 *   price, item_variants (array of { id, name, price }),
 *   item_tax, item_ordertype_id
 *
 * Docs: https://onlineorderingapisv210.docs.apiary.io/
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Petpooja shapes ───────────────────────────────────────────────────────

export interface RawPetpoojaVariant {
  id: number | string
  name: string
  price: string | number
  [key: string]: unknown
}

export interface RawPetpoojaItem {
  itemid: number | string
  itemname: string
  item_categoryid?: number | string | null
  item_description?: string | null
  item_image_url?: string | null
  item_type?: number | string | null
  /** 0 = inactive, 1 = active */
  active?: number | string | null
  price?: string | number | null
  item_variants?: RawPetpoojaVariant[]
  item_tax?: string | number | null
  item_attribute?: string | null
  item_ordertype_id?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCY = 'INR'

function toMinorUnits(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return majorToMinor(n, CURRENCY)
}

function mapStatus(active: number | string | null | undefined): ProductStatus {
  if (active == null) return 'ACTIVE'
  const n = typeof active === 'string' ? parseInt(active, 10) : active
  return n === 0 ? 'ARCHIVED' : 'ACTIVE'
}

function mapItemType(type: number | string | null | undefined): string | undefined {
  if (type == null) return undefined
  const n = typeof type === 'string' ? parseInt(type, 10) : type
  if (n === 1) return 'veg'
  if (n === 2) return 'non-veg'
  if (n === 3) return 'egg'
  return undefined
}

export function transformVariant(
  raw: RawPetpoojaVariant,
  parentId: number | string,
): ProductVariant {
  return {
    id: String(raw.id),
    productId: String(parentId),
    title: raw.name,
    price: { amount: toMinorUnits(raw.price), currency: CURRENCY },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawPetpoojaItem): Product {
  const variants = (raw.item_variants ?? []).map((v) =>
    transformVariant(v, raw.itemid),
  )
  const itemType = mapItemType(raw.item_type)

  const images =
    raw.item_image_url && raw.item_image_url.trim().length > 0
      ? [{ url: raw.item_image_url.trim() }]
      : undefined

  return {
    id: String(raw.itemid),
    title: raw.itemname,
    description: raw.item_description ?? undefined,
    status: mapStatus(raw.active),
    productType: itemType,
    variants: variants.length > 0 ? variants : undefined,
    images,
    metadata: {
      ...(raw as unknown as Record<string, unknown>),
      item_category_id: raw.item_categoryid,
    },
  }
}

/** Canonical Product → Petpooja item body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    itemname: product.title,
    item_description: product.description ?? null,
    active: product.status === 'ARCHIVED' ? 0 : 1,
  }
  if (product.images && product.images.length > 0) {
    body['item_image_url'] = product.images[0]!.url
  }
  if (product.variants && product.variants.length > 0) {
    body['item_variants'] = product.variants.map((v) => ({
      id: v.id,
      name: v.title ?? v.sku ?? '',
      price:
        v.price?.amount != null
          ? (minorToMajor(v.price.amount, v.price.currency ?? CURRENCY) ?? 0).toFixed(2)
          : '0.00',
    }))
  }
  return body
}
