/**
 * ColorMe Shop Product / Variant / Image → canonical.
 *
 * Field names verified directly against the official OpenAPI spec
 * (https://api.shop-pro.jp/v1/spec/open_api.json → paths["/v1/products"]):
 * `name`, `expl`, `display_state`, `sales_price`, `options[].values` (a real
 * string array, unlike Haravan), `variants[].option1_value`/`option2_value`,
 * `variants[].option_price`.
 *
 * ColorMe reports every price as an integer JPY amount with no currency
 * field anywhere in the spec (Shop/Product/Sale/ShopCoupon all lack one) —
 * this is a Japan-only platform, not a default being assumed here. JPY has
 * zero minor-unit digits, so the integer IS already the canonical minor-unit
 * amount.
 *
 * Because a product with no options addresses its own stock directly
 * (`stocks` on the Product itself, confirmed in the spec) while a product
 * WITH options addresses it per `variants[]` entry, this only maps the
 * `variants[]` array the platform actually returned — it never synthesises a
 * default variant from the product's own fields.
 */

import type { Product, ProductVariant, ProductOption } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

const CURRENCY = 'JPY'

export interface RawColormeImage {
  src: string
  position?: number
}

export interface RawColormeVariant {
  id: number
  product_id: number
  option1_value?: string | null
  option2_value?: string | null
  title?: string
  stocks?: number | null
  model_number?: string | null
  weight?: number | null
  option_price?: number | null
  make_date?: number
  update_date?: number
}

export interface RawColormeOption {
  id: number
  product_id: number
  name: string
  values: string[]
}

export interface RawColormeCategory {
  id_big: number
  id_small?: number
}

export interface RawColormeProduct {
  id: number
  name: string
  model_number?: string | null
  category?: RawColormeCategory | null
  group_ids?: number[]
  display_state: 'showing' | 'hidden' | 'showing_for_members' | 'sale_for_members'
  sales_price?: number | null
  price?: number | null
  cost?: number | null
  expl?: string | null
  weight?: number | null
  make_date: number
  update_date: number
  images?: RawColormeImage[]
  options?: RawColormeOption[]
  variants?: RawColormeVariant[]
  [key: string]: unknown
}

function unixToIso(seconds: number | undefined): string | undefined {
  return seconds != null ? new Date(seconds * 1000).toISOString() : undefined
}

function transformImage(raw: RawColormeImage): Image {
  return { url: raw.src, position: raw.position }
}

function transformOption(raw: RawColormeOption): ProductOption {
  return { id: String(raw.id), name: raw.name, values: raw.values }
}

function buildOptionValues(
  variant: RawColormeVariant,
  options: RawColormeOption[] | undefined,
): Record<string, string> | undefined {
  if (!options || options.length === 0) return undefined
  const out: Record<string, string> = {}
  const positional = [variant.option1_value, variant.option2_value]
  for (let i = 0; i < options.length && i < positional.length; i++) {
    const val = positional[i]
    if (val != null) out[options[i]!.name] = val
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawColormeVariant,
  options?: RawColormeOption[],
): ProductVariant {
  if (raw.option_price == null) {
    throw new Error(`ColorMe variant ${raw.id} has no option_price — refusing to invent one.`)
  }
  return {
    // Composite id: every variant endpoint is scoped under its parent
    // product (`/v1/products/{product_id}/variants/{id}`), so the id alone
    // is not enough to address it later (same technique the Shopify
    // reference adapter uses for order-scoped refunds/transactions).
    id: `${raw.product_id}:${raw.id}`,
    productId: String(raw.product_id),
    sku: raw.model_number ?? undefined,
    title: raw.title,
    price: { amount: raw.option_price, currency: CURRENCY },
    weight: raw.weight ?? undefined,
    weightUnit: raw.weight != null ? 'g' : undefined,
    optionValues: buildOptionValues(raw, options),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

const STATUS_ACTIVE = new Set(['showing', 'showing_for_members', 'sale_for_members'])

export function transformProduct(raw: RawColormeProduct): Product {
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, raw.options))
  const images = (raw.images ?? []).map(transformImage)
  const options = (raw.options ?? []).map(transformOption)

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.expl ?? undefined,
    status: STATUS_ACTIVE.has(raw.display_state) ? 'ACTIVE' : 'DRAFT',
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: unixToIso(raw.make_date),
    updatedAt: unixToIso(raw.update_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → ColorMe product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    expl: product.description,
  }
  if (product.status) body.display_state = product.status === 'ACTIVE' ? 'showing' : 'hidden'
  return body
}

/** Canonical ProductVariant → ColorMe variant body (`PUT .../variants/{id}`). */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    stocks: undefined, // stock is written via setInventoryLevel, not here
    model_number: variant.sku,
    weight: variant.weight,
    option_price: variant.price?.amount,
  }
}

/** Split a composite `${productId}:${variantId}` id. Throws — never guesses — on the old bare-id shape. */
export function splitVariantId(id: string): { productId: string; variantId: string } {
  const [productId, variantId] = id.split(':')
  if (!productId || !variantId) {
    throw new Error(`Invalid ColorMe variant id "${id}" — expected "productId:variantId".`)
  }
  return { productId, variantId }
}
