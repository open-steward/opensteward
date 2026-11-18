/**
 * BASE item ↔ canonical Product/ProductVariant.
 *
 * BASE's "item" is both the product and (when it carries no variations) the
 * sole purchasable unit — `price`/`stock` live on the item itself. When an
 * item DOES have variations, each is a flat `{variation, variation_stock,
 * variation_identifier, barcode}` entry (no per-variation price — BASE has
 * one price per item regardless of variation count).
 *
 * Confirmed fields (https://docs.thebase.in/api/, .../api/items,
 * .../api/items/add): `item_id`, `title`, `detail`, `price` (tax-included
 * yen, required), `proper_price` (strike-through reference price),
 * `item_tax_type`, `stock` (required on create), `visible` (1/0),
 * `list_order`, `identifier` (shop's own product code), `img1_origin`..
 * `img5_origin`, `modified` (unix seconds), `variations[]` with
 * `variation_id`, `variation` (label), `variation_stock`,
 * `variation_identifier`, `barcode`.
 *
 * Variations are NOT a standalone resource: they are created/renamed only by
 * re-submitting the full `variation[]`/`variation_stock[]`/
 * `variation_identifier[]`/`barcode[]` arrays on `items/add` or
 * `items/edit`, and removed one at a time via `items/delete_variation`
 * (`item_id` + `variation_id`). See ../index.ts for what this adapter
 * implements against that shape.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Product, ProductVariant } from '../../../schema/product'
import { CURRENCY } from '../constants'

export interface RawBaseEcVariation {
  variation_id: number | string
  variation: string
  variation_stock?: number
  variation_identifier?: string
  barcode?: string
  [key: string]: unknown
}

export interface RawBaseEcItem {
  item_id: number | string
  title: string
  detail?: string
  price: number
  proper_price?: number
  item_tax_type?: number
  stock?: number
  visible?: number
  list_order?: number
  identifier?: string
  modified?: number | string
  variations?: RawBaseEcVariation[]
  img1_origin?: string
  img2_origin?: string
  img3_origin?: string
  img4_origin?: string
  img5_origin?: string
  [key: string]: unknown
}

const IMAGE_KEYS = ['img1_origin', 'img2_origin', 'img3_origin', 'img4_origin', 'img5_origin'] as const

/**
 * Transform one BASE variation into a canonical ProductVariant. When
 * `variation` is omitted, synthesizes a single default variant representing
 * the item itself (BASE items without variations are still one purchasable
 * unit) — marked `metadata.synthetic` so `untransformProduct` can tell it
 * apart from a real, named variation.
 */
export function transformVariant(
  item: RawBaseEcItem,
  variation?: RawBaseEcVariation,
): ProductVariant {
  const itemId = String(item.item_id)
  const compareAtPrice =
    item.proper_price != null ? { amount: item.proper_price, currency: CURRENCY } : undefined

  if (variation) {
    return {
      id: `${itemId}:${variation.variation_id}`,
      productId: itemId,
      sku: variation.variation_identifier,
      barcode: variation.barcode,
      title: variation.variation,
      price: { amount: item.price, currency: CURRENCY },
      compareAtPrice,
      inventoryItemId: `${itemId}:${variation.variation_id}`,
      optionValues: { variation: variation.variation },
      metadata: variation as unknown as Record<string, unknown>,
    }
  }
  return {
    id: `${itemId}:default`,
    productId: itemId,
    sku: item.identifier,
    title: item.title,
    price: { amount: item.price, currency: CURRENCY },
    compareAtPrice,
    inventoryItemId: itemId,
    metadata: { synthetic: true },
  }
}

export function transformProduct(item: RawBaseEcItem): Product {
  const images = IMAGE_KEYS.map((key, i) => {
    const url = item[key]
    return url ? { url, position: i } : undefined
  }).filter((img): img is { url: string; position: number } => img !== undefined)

  const variants =
    item.variations && item.variations.length > 0
      ? item.variations.map((v) => transformVariant(item, v))
      : [transformVariant(item)]

  return {
    id: String(item.item_id),
    title: item.title,
    description: item.detail,
    status: item.visible === 0 ? 'DRAFT' : 'ACTIVE',
    images: images.length > 0 ? images : undefined,
    variants,
    updatedAt: toIsoDatetime(item.modified),
    metadata: item as unknown as Record<string, unknown>,
  }
}

/**
 * Build the `application/x-www-form-urlencoded` body for `items/add` /
 * `items/edit`.
 *
 * BASE requires `title`, `price`, and `stock` on every create — but
 * `stock` has no canonical home on `Product`/`ProductVariant` (it's a
 * separate `InventoryLevel` concern here, same as every other adapter in
 * this vertical). Rather than inventing a `0`, this reads the starting
 * count from `variants[i].metadata.stock` — an explicit escape hatch the
 * caller must supply — and throws if it's missing, per resource.
 */
/**
 * BASE variations are identified only by their display label (e.g. "Black /
 * M") — there is no separate name field and no default, so a variant with
 * no `title` cannot be sent to `items/add`/`items/edit` without silently
 * creating an unnamed, indistinguishable variation.
 */
function variationTitleOf(variant: { title?: string }, index: number): string {
  if (!variant.title) {
    throw new Error(
      `BASE createProduct/updateProduct requires a \`title\` for variants[${index}] — ` +
        'BASE identifies each variation by its display label; there is no default.',
    )
  }
  return variant.title
}

function stockOf(variant: { metadata: Record<string, unknown> }, label: string): number {
  const stock = variant.metadata['stock']
  if (typeof stock !== 'number') {
    throw new Error(
      `BASE createProduct/updateProduct requires an initial stock count for ${label} — ` +
        'pass it as `metadata.stock` on that variant (no canonical Product/ProductVariant ' +
        'field carries starting inventory; BASE will not accept a create without one).',
    )
  }
  return stock
}

export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const primary = data.variants?.[0]
  if (!primary?.price) {
    throw new Error(
      'BASE createProduct/updateProduct requires at least one variant with a `price` ' +
        '(BASE prices at the item level, not per-variation).',
    )
  }
  // BASE's variation arrays only make sense with more than one option — a
  // single variant (however it arrived: freshly built, or the synthetic
  // default `transformProduct` synthesises for a variation-less item) is a
  // simple item, addressed by its own `identifier`/`stock`, not a
  // one-element `variation[]` array.
  const variants = data.variants ?? []
  const hasNamedVariations = variants.length > 1

  const body: Record<string, unknown> = {
    title: data.title,
    detail: data.description,
    price: primary.price.amount,
    visible: data.status ? (data.status === 'ACTIVE' ? 1 : 0) : undefined,
  }

  if (hasNamedVariations) {
    const titles = variants.map((v, i) => variationTitleOf(v, i))
    body.variation = titles
    body.variation_stock = variants.map((v, i) => stockOf(v, `variants[${i}] (${titles[i]})`))
    body.variation_identifier = variants.map((v) => v.sku)
    body.barcode = variants.map((v) => v.barcode)
  } else {
    body.identifier = primary.sku
    body.stock = stockOf(primary, 'the product')
  }
  return body
}
