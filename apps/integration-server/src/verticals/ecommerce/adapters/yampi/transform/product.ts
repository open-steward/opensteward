/**
 * WooCommerce Product / ProductVariation → canonical.
 *
 * WC exposes two shapes:
 *  - Simple products have stock/price directly on the product object.
 *  - Variable products have `type: 'variable'` and their buyable SKUs
 *    live under `/products/{id}/variations`. WC does NOT inline variations
 *    in the product list response — the adapter fetches them separately
 *    and passes them in via the optional `variations` field on the raw
 *    shape.
 *
 * WC attributes (`[{ name, options, variation: true }]`) map to the
 * canonical `ProductOption` shape. Variation `attributes`
 * (`[{ name, option }]`) map to the canonical `optionValues` record.
 *
 * Prices come as strings (`"19.99"`); statuses come as lowercase WP
 * post statuses (`publish` / `draft` / `pending` / `private` / `trash`).
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw WC shapes (minimal) ──────────────────────────────────────────────────

export interface RawWooCommerceImage {
  id?: number | string
  src?: string
  name?: string | null
  alt?: string | null
  position?: number
  date_created?: string
}

export interface RawWooCommerceAttribute {
  id?: number | string
  name: string
  position?: number
  visible?: boolean
  variation?: boolean
  options?: string[]
  option?: string
}

export interface RawWooCommerceVariation {
  id: number | string
  sku?: string
  price?: string | number
  regular_price?: string | number
  sale_price?: string | number | null
  status?: string
  description?: string
  weight?: string | number | null
  dimensions?: { length?: string; width?: string; height?: string }
  manage_stock?: boolean
  stock_quantity?: number | null
  stock_status?: string
  tax_status?: string
  tax_class?: string
  attributes?: RawWooCommerceAttribute[]
  image?: RawWooCommerceImage | null
  menu_order?: number
  [key: string]: unknown
}

export interface RawWooCommerceProduct {
  id: number | string
  name: string
  slug?: string
  permalink?: string
  date_created?: string
  date_created_gmt?: string
  date_modified?: string
  date_modified_gmt?: string
  type?: string // 'simple' | 'variable' | 'grouped' | 'external'
  status?: string // 'publish' | 'draft' | 'pending' | 'private' | 'trash'
  description?: string
  short_description?: string
  sku?: string
  price?: string | number
  regular_price?: string | number
  sale_price?: string | number | null
  manage_stock?: boolean
  stock_quantity?: number | null
  stock_status?: string
  weight?: string | number | null
  tags?: Array<{ id?: number; name: string; slug?: string }>
  categories?: Array<{ id?: number; name: string; slug?: string }>
  images?: RawWooCommerceImage[]
  attributes?: RawWooCommerceAttribute[]
  default_attributes?: RawWooCommerceAttribute[]
  variations?: number[] | RawWooCommerceVariation[]
  parent_id?: number | string
  meta_data?: Array<{ key: string; value: unknown }>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/** WooCommerce prices are decimal major units; canonical Money is minor units. */
function toMinor(v: string | number | null | undefined, currency: string): number {
  const n = toMoneyAmount(v)
  return majorToMinor(n, currency)
}

/** Canonical Money (minor units) → WooCommerce decimal-major price string. */
function minorToMajor(v: number | undefined): string | undefined {
  return v == null ? undefined : (v / 100).toString()
}

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  switch (s.toLowerCase()) {
    case 'publish':
      return 'ACTIVE'
    case 'draft':
    case 'auto-draft':
      return 'DRAFT'
    case 'pending':
    case 'private':
    case 'trash':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

/**
 * WooCommerce stores product weight in the site-wide unit configured
 * under Settings → Products. The REST API does not surface that unit on
 * each product, so we default to grams to match Shopify's native unit
 * and document the caveat in the canonical metadata.
 */
function defaultWeightUnit(): WeightUnit {
  return 'g'
}

function transformImage(raw: RawWooCommerceImage): Image {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.src ?? '',
    alt: raw.alt ?? raw.name ?? undefined,
    position: raw.position,
  }
}

function transformAttribute(raw: RawWooCommerceAttribute): ProductOption {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name,
    values: raw.options ?? [],
    position: raw.position,
  }
}

/**
 * Build the canonical `optionValues` record for a variation by reading
 * the variation's attributes array — each entry has a `name` and a
 * single selected `option`.
 */
function buildVariationOptionValues(
  attributes: RawWooCommerceAttribute[] | undefined,
): Record<string, string> | undefined {
  if (!attributes || attributes.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const a of attributes) {
    if (a.option != null) out[a.name] = a.option
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformProductVariant(
  raw: RawWooCommerceVariation,
  productId: string,
  currency: string = 'USD',
): ProductVariant {
  const sale = raw.sale_price
  const regular = raw.regular_price ?? raw.price
  const effective = raw.price ?? raw.regular_price
  return {
    id: `${productId}:${raw.id}`,
    productId,
    sku: raw.sku || undefined,
    title: undefined,
    price: { amount: toMinor(effective, currency), currency },
    compareAtPrice:
      sale != null && sale !== '' && regular != null && regular !== ''
        ? { amount: toMinor(regular, currency), currency }
        : undefined,
    weight: raw.weight != null ? toMoneyAmount(raw.weight) : undefined,
    weightUnit: raw.weight != null ? defaultWeightUnit() : undefined,
    inventoryItemId: String(raw.id),
    optionValues: buildVariationOptionValues(raw.attributes),
    taxable: raw.tax_status === 'taxable' || raw.tax_status === undefined,
    position: raw.menu_order,
    metadata: {
      ...(raw as Record<string, unknown>),
      parentProductId: productId,
    },
  }
}

export function transformProduct(
  raw: RawWooCommerceProduct,
  currency: string = 'USD',
): Product {
  const productId = String(raw.id)
  const images = (raw.images ?? []).map(transformImage)
  const attrOptions = (raw.attributes ?? [])
    .filter((a) => (a.options ?? []).length > 0)
    .map(transformAttribute)

  // WC `variations` is usually an array of numeric ids in the product
  // list response. The adapter may pre-fetch the full variation objects
  // and pass them in; transform both shapes.
  const variationObjs: RawWooCommerceVariation[] = Array.isArray(raw.variations)
    ? (raw.variations.filter(
        (v): v is RawWooCommerceVariation => typeof v === 'object' && v !== null,
      ) as RawWooCommerceVariation[])
    : []
  const variants = variationObjs.map((v) =>
    transformProductVariant(v, productId, currency),
  )

  // For simple products, synthesize a single variant from the product
  // itself so downstream code can always iterate `product.variants`.
  if (raw.type !== 'variable' && variants.length === 0) {
    variants.push({
      id: `${productId}:default`,
      productId,
      sku: raw.sku || undefined,
      price: { amount: toMinor(raw.price ?? raw.regular_price, currency), currency },
      compareAtPrice:
        raw.sale_price != null && raw.sale_price !== '' && raw.regular_price != null
          ? { amount: toMinor(raw.regular_price, currency), currency }
          : undefined,
      weight: raw.weight != null ? toMoneyAmount(raw.weight) : undefined,
      weightUnit: raw.weight != null ? defaultWeightUnit() : undefined,
      inventoryItemId: productId,
      metadata: {
        synthetic: true,
        reason: 'WooCommerce simple product has no variations',
        parentProductId: productId,
      },
    })
  }

  const tags = raw.tags?.map((t) => t.name)
  const productType =
    raw.categories && raw.categories.length > 0 ? raw.categories[0]!.name : undefined

  return {
    id: productId,
    title: raw.name,
    description: raw.description,
    handle: raw.slug,
    status: mapStatus(raw.status),
    productType,
    tags: tags && tags.length > 0 ? tags : undefined,
    options: attrOptions.length > 0 ? attrOptions : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created,
    updatedAt: raw.date_modified_gmt ?? raw.date_modified,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → WooCommerce product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    // Reverse of mapStatus — WC uses `publish` for ACTIVE.
    status:
      product.status === 'ACTIVE'
        ? 'publish'
        : product.status === 'DRAFT'
          ? 'draft'
          : product.status === 'ARCHIVED'
            ? 'private'
            : undefined,
  }
  if (product.options) {
    body['attributes'] = product.options.map((o) => ({
      name: o.name,
      position: o.position,
      options: o.values,
      visible: true,
      variation: true,
    }))
  }
  if (product.tags) {
    body['tags'] = product.tags.map((t) => ({ name: t }))
  }
  if (product.images) {
    body['images'] = product.images.map((i) => ({
      id: i.id,
      src: i.url,
      alt: i.alt,
      position: i.position,
    }))
  }
  // Simple-product pricing: if the canonical product has exactly one
  // variant, flatten its price onto the product body.
  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) body['regular_price'] = minorToMajor(v.price.amount)
    if (v.compareAtPrice?.amount != null) {
      body['sale_price'] = minorToMajor(v.price?.amount)
      body['regular_price'] = minorToMajor(v.compareAtPrice.amount)
    }
    if (v.sku) body['sku'] = v.sku
  }
  return body
}

/** Canonical ProductVariant → WooCommerce variation body. */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sku: variant.sku,
    regular_price: minorToMajor(variant.price?.amount),
    sale_price: minorToMajor(variant.compareAtPrice?.amount),
    weight: variant.weight?.toString(),
    menu_order: variant.position,
  }
  if (variant.optionValues) {
    body['attributes'] = Object.entries(variant.optionValues).map(([name, option]) => ({
      name,
      option,
    }))
  }
  return body
}
