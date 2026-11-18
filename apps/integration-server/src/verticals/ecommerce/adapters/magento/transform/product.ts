/**
 * Magento Product → canonical Product + ProductVariant.
 *
 * Magento has two relevant product shapes:
 *
 *  - `type_id: 'simple'` — a single purchasable SKU. We synthesise a
 *    single default variant from the product itself so downstream code
 *    can always iterate `product.variants`.
 *  - `type_id: 'configurable'` — a parent product that represents a
 *    family of child simple SKUs. Children are NOT inlined in the
 *    product payload; the adapter fetches them separately via
 *    `/V1/configurable-products/{parentSku}/children` and passes them
 *    in via the optional `children` argument on `transformProduct`.
 *
 * Attribute values (`color`, `size`, description, etc.) come from the
 * `custom_attributes` array as `[{ attribute_code, value }]`. Stock
 * comes from `extension_attributes.stock_item.qty`. Status is an
 * integer enum: `1 → ACTIVE`, `2 → ARCHIVED`.
 *
 * Canonical `Product.id` and `ProductVariant.productId` are the parent
 * SKU (Magento's identifier for configurables in the REST surface),
 * while each child variant's canonical id is the composite
 * `parentSku:childSku`.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Magento shapes ──────────────────────────────────────────────────────

export interface RawMagentoCustomAttribute {
  attribute_code: string
  value: unknown
}

export interface RawMagentoMediaGalleryEntry {
  id?: number | string
  media_type?: string
  label?: string | null
  position?: number
  disabled?: boolean
  file?: string
  types?: string[]
  content?: Record<string, unknown>
}

export interface RawMagentoStockItem {
  item_id?: number
  product_id?: number
  stock_id?: number
  qty?: number
  is_in_stock?: boolean
  manage_stock?: boolean
  min_qty?: number
  use_config_manage_stock?: boolean
}

export interface RawMagentoConfigurableOptionValue {
  value_index?: number
  label?: string
}

export interface RawMagentoConfigurableOption {
  id?: number
  attribute_id?: string
  label?: string
  position?: number
  values?: RawMagentoConfigurableOptionValue[]
  product_id?: number
}

export interface RawMagentoExtensionAttributes {
  stock_item?: RawMagentoStockItem
  website_ids?: number[]
  category_links?: Array<{ position?: number; category_id: string }>
  configurable_product_options?: RawMagentoConfigurableOption[]
  configurable_product_links?: number[]
  [key: string]: unknown
}

export interface RawMagentoProduct {
  id?: number
  sku: string
  name: string
  attribute_set_id?: number
  price?: number
  status?: number // 1 = enabled/ACTIVE, 2 = disabled/ARCHIVED
  visibility?: number
  type_id?: string // 'simple' | 'configurable' | 'virtual' | 'bundle' | 'grouped' | 'downloadable'
  created_at?: string
  updated_at?: string
  weight?: number | string
  extension_attributes?: RawMagentoExtensionAttributes
  product_links?: unknown[]
  options?: unknown[]
  media_gallery_entries?: RawMagentoMediaGalleryEntry[]
  tier_prices?: unknown[]
  custom_attributes?: RawMagentoCustomAttribute[]
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(status: number | undefined): ProductStatus | undefined {
  if (status == null) return undefined
  if (status === 1) return 'ACTIVE'
  if (status === 2) return 'ARCHIVED'
  return undefined
}

function defaultWeightUnit(): WeightUnit {
  // Magento stores weight in the site-wide configured unit; the REST
  // API does not surface it per-product. Default to grams to match the
  // other adapters, documented in metadata.
  return 'g'
}

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function getCustomAttribute(
  raw: RawMagentoProduct,
  code: string,
): unknown | undefined {
  const hit = raw.custom_attributes?.find((a) => a.attribute_code === code)
  return hit?.value
}

function mapImages(raw: RawMagentoProduct): Image[] {
  const entries = raw.media_gallery_entries ?? []
  return entries
    .filter((e) => !e.disabled && (e.file || e.content))
    .map((e) => ({
      id: e.id != null ? String(e.id) : undefined,
      url: e.file ? `/media/catalog/product${e.file}` : '',
      alt: e.label ?? undefined,
      position: e.position,
    }))
}

function buildOptionsForConfigurable(raw: RawMagentoProduct): ProductOption[] | undefined {
  const cfg = raw.extension_attributes?.configurable_product_options
  if (!cfg || cfg.length === 0) return undefined
  return cfg.map((opt, idx) => ({
    id: opt.id != null ? String(opt.id) : undefined,
    name: opt.label ?? `option_${idx}`,
    values: (opt.values ?? [])
      .map((v) => v.label ?? (v.value_index != null ? String(v.value_index) : ''))
      .filter((s) => s.length > 0),
    position: opt.position ?? idx,
  }))
}

/**
 * Build `optionValues` map for a variant by reading its custom
 * attributes against the parent's configurable options. Magento stores
 * selected values as numeric `value_index`es on the child product's
 * custom attributes — we resolve them against the parent's option
 * definitions by attribute_id.
 *
 * If we can't resolve a label we fall back to the numeric value, which
 * still produces a schema-valid string-to-string record.
 */
function buildVariantOptionValues(
  child: RawMagentoProduct,
  parent: RawMagentoProduct | undefined,
): Record<string, string> | undefined {
  if (!parent) return undefined
  const cfgOptions = parent.extension_attributes?.configurable_product_options ?? []
  if (cfgOptions.length === 0) return undefined

  const out: Record<string, string> = {}
  for (const opt of cfgOptions) {
    if (!opt.attribute_id || !opt.label) continue
    const rawVal = getCustomAttribute(child, `attribute_${opt.attribute_id}`)
    // Some Magento responses expose selected values under the
    // attribute's own code directly (e.g. `color`, `size`); also try
    // that path.
    const byLabelKey = opt.label.toLowerCase()
    const rawValFromLabel = getCustomAttribute(child, byLabelKey)
    const val = rawVal ?? rawValFromLabel
    if (val == null) continue
    const asString = String(val)
    // Try to resolve numeric value_index against opt.values labels.
    const match = opt.values?.find(
      (v) => v.value_index != null && String(v.value_index) === asString,
    )
    out[opt.label] = match?.label ?? asString
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function extractStockQty(raw: RawMagentoProduct): number | undefined {
  const si = raw.extension_attributes?.stock_item
  return si?.qty
}

// ── Variant transform ──────────────────────────────────────────────────────

export function transformProductVariant(
  child: RawMagentoProduct,
  parentSku: string,
  parent?: RawMagentoProduct,
  currency: string = 'USD',
): ProductVariant {
  const childSku = child.sku
  const weight = child.weight != null ? toNum(child.weight) : undefined
  return {
    id: `${parentSku}:${childSku}`,
    productId: parentSku,
    sku: childSku,
    title: child.name,
    price: { amount: majorToMinor(toNum(child.price), currency), currency },
    weight,
    weightUnit: weight != null ? defaultWeightUnit() : undefined,
    inventoryItemId: childSku,
    optionValues: buildVariantOptionValues(child, parent),
    taxable: true,
    requiresShipping: child.type_id !== 'virtual' && child.type_id !== 'downloadable',
    metadata: {
      ...(child as Record<string, unknown>),
      parentSku,
    },
  }
}

// ── Product transform ───────────────────────────────────────────────────────

export function transformProduct(
  raw: RawMagentoProduct,
  children?: RawMagentoProduct[],
  currency: string = 'USD',
): Product {
  const productId = raw.sku
  const images = mapImages(raw)
  const description = getCustomAttribute(raw, 'description') as string | undefined
  const urlKey = getCustomAttribute(raw, 'url_key') as string | undefined

  const weight = raw.weight != null ? toNum(raw.weight) : undefined

  const options = buildOptionsForConfigurable(raw)

  let variants: ProductVariant[] = []
  if (raw.type_id === 'configurable' && children && children.length > 0) {
    variants = children.map((c) => transformProductVariant(c, productId, raw, currency))
  } else if (raw.type_id !== 'configurable') {
    // Synthesise a single default variant for simple / virtual /
    // downloadable / grouped products, so callers can always iterate
    // `product.variants`.
    variants = [
      {
        id: `${productId}:default`,
        productId,
        sku: productId,
        title: raw.name,
        price: { amount: majorToMinor(toNum(raw.price), currency), currency },
        weight,
        weightUnit: weight != null ? defaultWeightUnit() : undefined,
        inventoryItemId: productId,
        taxable: true,
        requiresShipping:
          raw.type_id !== 'virtual' && raw.type_id !== 'downloadable',
        metadata: {
          synthetic: true,
          reason: `Magento ${raw.type_id ?? 'simple'} product has no separate variants`,
          parentSku: productId,
          stockQty: extractStockQty(raw),
        },
      },
    ]
  }

  return {
    id: productId,
    title: raw.name,
    description,
    handle: toSlug(urlKey),
    status: mapStatus(raw.status),
    productType: raw.type_id,
    options,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ──────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const customAttributes: RawMagentoCustomAttribute[] = []
  if (product.description != null) {
    customAttributes.push({ attribute_code: 'description', value: product.description })
  }
  if (product.handle != null) {
    customAttributes.push({ attribute_code: 'url_key', value: product.handle })
  }

  const first = product.variants?.[0]
  const price = first?.price?.amount != null ? first.price.amount / 100 : undefined
  const weight = first?.weight

  const body: Record<string, unknown> = {
    product: {
      sku: product.id ?? first?.sku,
      name: product.title,
      price,
      status:
        product.status === 'ACTIVE'
          ? 1
          : product.status === 'ARCHIVED' || product.status === 'DRAFT'
            ? 2
            : undefined,
      type_id: product.productType ?? 'simple',
      weight,
      custom_attributes: customAttributes.length > 0 ? customAttributes : undefined,
    },
  }
  return body
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    product: {
      sku: variant.sku,
      name: variant.title,
      price: variant.price?.amount != null ? variant.price.amount / 100 : undefined,
      weight: variant.weight,
      type_id: 'simple',
    },
  }
}
