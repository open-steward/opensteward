/**
 * Marketplacer Advert (Product) + Variant transforms.
 *
 * Structural note: unlike Shopify, Marketplacer prices at the ADVERT level
 * (`price` is an attribute of the product in `advertUpsert`, and `lowestPrice`
 * / `lowestOriginalPrice` are Advert-level read fields — see
 * docs/seller-api/examples/products/howto_addproducts.txt and
 * docs/seller-api/reference/queries/node.txt), not per-variant. The canonical
 * `ProductVariant.price` field is required, so every variant of one Advert is
 * given that Advert's price here.
 *
 * `brandId` / `taxonId` / variant `optionValueIds` are mandatory,
 * operator-controlled-vocabulary references on `advertUpsert`
 * (docs/seller-api/examples/products/howto_addproducts.txt — "Advert Schema"
 * / "Taxonomy") that the canonical Product/ProductVariant shape has no field
 * for (it models `vendor`/`productType` as free text and `optionValues` as a
 * name→value map). Callers supply them via `metadata` — see `untransformProduct`
 * / `untransformVariant` — resolved beforehand via the `brands` / `taxons` /
 * `node` (Prototype) queries, exactly as the "Managing Adverts" how-to walks
 * through.
 *
 * Docs cited:
 *   https://api.marketplacer.com/docs/seller-api/examples/products/howto_addproducts/
 *   https://api.marketplacer.com/docs/seller-api/examples/products/howto_updateproducts/
 *   https://api.marketplacer.com/docs/seller-api/examples/products/howto_queryadverts/
 *   https://api.marketplacer.com/docs/seller-api/reference/queries/node/
 */
import type { Product, ProductVariant } from '../../../schema/product'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawMarketplacerVariant {
  id: string
  legacyId?: number
  label?: string
  sku?: string
  barcode?: string
  countOnHand?: number
  published?: boolean
  displayable?: boolean
  buyable?: boolean
  [key: string]: unknown
}

export interface RawMarketplacerAdvert {
  id: string
  legacyId?: number
  title?: string
  description?: string
  published?: boolean
  displayable?: boolean
  online?: boolean
  /** Numeric or decimal-string major-unit amount — see file header. */
  lowestPrice?: number | string | null
  lowestOriginalPrice?: number | string | null
  brand?: { id: string; name?: string } | null
  variants?: { nodes: RawMarketplacerVariant[] } | null
  [key: string]: unknown
}

function toMinor(value: number | string | null | undefined, currency: string): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return undefined
  return majorToMinor(n, currency)
}

/**
 * Advert state → canonical `ProductStatus`. Marketplacer has no single status
 * field; `published` (seller intent), `displayable` (system-computed
 * sellability) and `online` (seller-account state) combine instead — see
 * "Advert State" in docs/seller-api/examples/products/howto_queryadverts.
 * `published: false` is the seller's own withdrawal → ARCHIVED. `published:
 * true` but not yet `displayable` is an incomplete/pending advert → DRAFT.
 * Both true → ACTIVE (an offline `online` reflects the SELLER's account, not
 * this product, and metadata carries it for callers who care).
 */
function productStatus(raw: RawMarketplacerAdvert): Product['status'] {
  if (raw.published === false) return 'ARCHIVED'
  if (raw.published === true && raw.displayable === false) return 'DRAFT'
  if (raw.published === true && raw.displayable === true) return 'ACTIVE'
  return undefined
}

export function transformVariant(
  raw: RawMarketplacerVariant,
  opts: {
    productId: string
    price?: number | string | null
    compareAtPrice?: number | string | null
    /** No default: Marketplacer's API reports no currency of its own — see
     *  ./connect-form.ts, which collects it from the seller at connect time. */
    currency: string
  },
): ProductVariant {
  const { currency } = opts
  if (!currency) {
    throw new Error('transformVariant requires a currency — Marketplacer reports no currency of its own.')
  }
  const amount = toMinor(opts.price, currency)
  if (amount == null) {
    throw new Error(
      `Marketplacer variant ${raw.id} has no usable price — its Advert's lowestPrice is not set.`,
    )
  }
  const compareAmount = toMinor(opts.compareAtPrice, currency)
  return {
    id: String(raw.id),
    productId: opts.productId,
    sku: raw.sku ?? undefined,
    barcode: raw.barcode ?? undefined,
    title: raw.label ?? undefined,
    price: { amount, currency },
    ...(compareAmount != null && compareAmount > amount
      ? { compareAtPrice: { amount: compareAmount, currency } }
      : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Title is required canonically; a marketplacer product without one is not given an invented empty title. */
function requireTitle(title: string | null | undefined, id: string): string {
  if (!title) throw new Error(`marketplacer product ${id} has no title to map; refusing to invent one`)
  return title
}

export function transformProduct(raw: RawMarketplacerAdvert, currency: string): Product {
  const variantNodes = raw.variants?.nodes ?? []
  return {
    id: String(raw.id),
    title: requireTitle(raw.title, String(raw.id)),
    description: raw.description ?? undefined,
    status: productStatus(raw),
    vendor: raw.brand?.name ?? undefined,
    variants:
      variantNodes.length > 0
        ? variantNodes.map((v) =>
            transformVariant(v, {
              productId: String(raw.id),
              price: raw.lowestPrice,
              compareAtPrice: raw.lowestOriginalPrice,
              currency,
            }),
          )
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** One Marketplacer `variants[]` entry for `advertUpsert`, shared by create and update. */
export interface MarketplacerVariantAttrsInput {
  id?: string
  externalId?: string
  countOnHand?: number
  barcode?: string
  sku?: string
  optionValueIds?: string[]
}

function untransformVariantAttrs(v: Partial<ProductVariant>): MarketplacerVariantAttrsInput {
  const out: MarketplacerVariantAttrsInput = {}
  if (v.id) out.id = v.id
  if (v.barcode) out.barcode = v.barcode
  if (v.sku) out.sku = v.sku
  const meta = v.metadata as Record<string, unknown> | undefined
  const optionValueIds = meta?.['optionValueIds']
  if (Array.isArray(optionValueIds)) out.optionValueIds = optionValueIds.map(String)
  return out
}

/** Public alias — a variant can also be upserted standalone via `variantUpdate`. */
export function untransformVariant(v: Partial<ProductVariant>): MarketplacerVariantAttrsInput {
  return untransformVariantAttrs(v)
}

/** The `attributes` object for `advertUpsert` — see file header for the metadata-carried fields. */
export interface MarketplacerAdvertAttrsInput {
  title?: string
  description?: string
  price?: string
  brandId?: string
  taxonId?: string
  images?: Array<{ sourceUrl: string }>
  variants?: MarketplacerVariantAttrsInput[]
  attemptAutoPublish?: boolean
}

/**
 * `currency` is the connection's marketplace currency (see ./connect-form.ts)
 * — required so a price can be converted to the major-unit decimal string
 * `advertUpsert` expects; there is no platform default to fall back to.
 */
export function untransformProduct(data: Partial<Product>, currency: string): MarketplacerAdvertAttrsInput {
  const meta = data.metadata as Record<string, unknown> | undefined
  const priceMinor = data.variants?.[0]?.price?.amount
  const out: MarketplacerAdvertAttrsInput = {}
  if (data.title !== undefined) out.title = data.title
  if (data.description !== undefined) out.description = data.description
  if (priceMinor != null) out.price = String(minorToMajor(priceMinor, currency))
  if (meta?.['brandId']) out.brandId = String(meta['brandId'])
  if (meta?.['taxonId']) out.taxonId = String(meta['taxonId'])
  if (data.images && data.images.length > 0) {
    out.images = data.images.map((img) => ({ sourceUrl: img.url }))
  }
  if (data.variants && data.variants.length > 0) {
    out.variants = data.variants.map(untransformVariantAttrs)
  }
  return out
}
