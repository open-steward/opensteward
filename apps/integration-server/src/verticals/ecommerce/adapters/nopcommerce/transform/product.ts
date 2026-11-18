/**
 * nopCommerce Product → canonical Product / ProductVariant.
 *
 * nopCommerce models variants via "product attribute combinations" rather
 * than first-class variant objects. Each combination maps a set of product
 * attribute values to a SKU, stock quantity, and optional price adjustment.
 *
 * Key API shapes:
 *  - Products: `/api/products` returns `{ products: [...] }`
 *  - Product attributes: nested under `product_attribute_mappings`
 *  - Attribute combinations: nested under `product_attribute_combinations`
 *
 * Prices are numeric (not string-encoded like WooCommerce). Status uses
 * a `published` boolean rather than a string status field.
 *
 * Docs: https://docs.nopcommerce.com/en/developer/web-api/index.html
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw nopCommerce shapes ──────────────────────────────────────────────────

export interface RawNopImage {
  id?: number | string
  src?: string
  attachment?: string
  position?: number
  alt?: string | null
}

export interface RawNopProductAttributeValue {
  id?: number | string
  name?: string
  price_adjustment?: number
  weight_adjustment?: number
  is_pre_selected?: boolean
  display_order?: number
  type_id?: number
}

export interface RawNopProductAttributeMapping {
  id?: number | string
  product_attribute_id?: number | string
  product_attribute_name?: string
  text_prompt?: string
  is_required?: boolean
  display_order?: number
  attribute_control_type_id?: number
  attribute_values?: RawNopProductAttributeValue[]
}

export interface RawNopAttributeCombination {
  id?: number | string
  product_id?: number | string
  attributes_xml?: string
  stock_quantity?: number
  allow_out_of_stock_orders?: boolean
  sku?: string
  manufacturer_part_number?: string
  gtin?: string
  overridden_price?: number | null
  notify_admin_for_quantity_below?: number
  picture_id?: number | string
}

export interface RawNopProduct {
  id: number | string
  name: string
  short_description?: string | null
  full_description?: string | null
  sku?: string | null
  price?: number
  old_price?: number | null
  product_cost?: number
  published?: boolean
  deleted?: boolean
  weight?: number | null
  product_type?: string
  vendor_id?: number | string | null
  parent_grouped_product_id?: number | string | null
  visible_individually?: boolean
  order_minimum_quantity?: number
  order_maximum_quantity?: number
  manage_inventory_method_id?: number
  stock_quantity?: number
  display_stock_availability?: boolean
  display_stock_quantity?: boolean
  min_stock_quantity?: number
  use_multiple_warehouses?: boolean
  warehouse_id?: number
  is_gift_card?: boolean
  require_other_products?: boolean
  automatically_add_required_products?: boolean
  is_download?: boolean
  has_user_agreement?: boolean
  is_recurring?: boolean
  is_rental?: boolean
  is_taxable?: boolean
  is_free_shipping?: boolean
  is_ship_enabled?: boolean
  tax_category_id?: number
  se_name?: string | null
  tags?: string[] | string | null
  images?: RawNopImage[]
  product_attribute_mappings?: RawNopProductAttributeMapping[]
  product_attribute_combinations?: RawNopAttributeCombination[]
  created_on_utc?: string
  updated_on_utc?: string
  category_ids?: Array<number | string>
  manufacturer_ids?: Array<number | string>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(raw: RawNopProduct): ProductStatus | undefined {
  if (raw.deleted) return 'ARCHIVED'
  if (raw.published === true) return 'ACTIVE'
  if (raw.published === false) return 'DRAFT'
  return undefined
}

function transformImage(raw: RawNopImage): Image {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.src ?? raw.attachment ?? '',
    alt: raw.alt ?? undefined,
    position: raw.position,
  }
}

function transformAttributeToOption(
  raw: RawNopProductAttributeMapping,
): ProductOption {
  const values = (raw.attribute_values ?? []).map((v) => v.name ?? String(v.id ?? ''))
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.product_attribute_name ?? raw.text_prompt ?? '',
    values,
    position: raw.display_order,
  }
}

/**
 * Parse nopCommerce's `attributes_xml` to extract selected attribute values.
 * Format: `<Attributes><ProductAttribute ID="X"><ProductAttributeValue><Value>Y</Value></ProductAttributeValue></ProductAttribute></Attributes>`
 *
 * We use simple regex parsing since we cannot pull in an XML library, and
 * the format is predictable.
 */
export function parseAttributesXml(
  xml: string | undefined,
  mappings: RawNopProductAttributeMapping[] | undefined,
): Record<string, string> | undefined {
  if (!xml || !mappings || mappings.length === 0) return undefined

  const result: Record<string, string> = {}
  // Match each ProductAttribute element
  const attrRegex = /<ProductAttribute\s+ID="(\d+)"[^>]*>([\s\S]*?)<\/ProductAttribute>/gi
  let match: RegExpExecArray | null

  while ((match = attrRegex.exec(xml)) !== null) {
    const mappingId = match[1]
    const innerXml = match[2] ?? ''
    // Extract the value
    const valueMatch = /<Value>([^<]*)<\/Value>/i.exec(innerXml)
    if (!valueMatch) continue
    const valueId = valueMatch[1] ?? ''

    // Find the mapping by id
    const mapping = mappings.find((m) => String(m.id) === mappingId)
    if (!mapping) continue

    const attrName = mapping.product_attribute_name ?? ''
    // Find the value name by id
    const attrValue = (mapping.attribute_values ?? []).find(
      (v) => String(v.id) === valueId,
    )
    result[attrName] = attrValue?.name ?? valueId
  }

  return Object.keys(result).length > 0 ? result : undefined
}

export function transformProductVariant(
  raw: RawNopAttributeCombination,
  productId: string,
  basePrice: number = 0,
  currency: string = 'USD',
  mappings?: RawNopProductAttributeMapping[],
): ProductVariant {
  const price = raw.overridden_price ?? basePrice
  return {
    id: `${productId}:${raw.id}`,
    productId,
    sku: raw.sku || undefined,
    barcode: raw.gtin || undefined,
    title: undefined,
    price: { amount: majorToMinor(price, currency), currency },
    compareAtPrice: undefined,
    inventoryItemId: raw.id != null ? String(raw.id) : undefined,
    optionValues: parseAttributesXml(raw.attributes_xml, mappings),
    metadata: {
      ...(raw as Record<string, unknown>),
      parentProductId: productId,
    },
  }
}

export function transformProduct(
  raw: RawNopProduct,
  currency: string = 'USD',
): Product {
  const productId = String(raw.id)
  const images = (raw.images ?? []).map(transformImage)
  const options = (raw.product_attribute_mappings ?? [])
    .filter((m) => (m.attribute_values ?? []).length > 0)
    .map(transformAttributeToOption)

  const combinations = raw.product_attribute_combinations ?? []
  const variants = combinations.map((c) =>
    transformProductVariant(
      c,
      productId,
      raw.price ?? 0,
      currency,
      raw.product_attribute_mappings,
    ),
  )

  // If no combinations exist, synthesize a default variant from the product.
  if (variants.length === 0) {
    variants.push({
      id: `${productId}:default`,
      productId,
      sku: raw.sku || undefined,
      price: { amount: majorToMinor(raw.price ?? 0, currency), currency },
      compareAtPrice:
        raw.old_price != null && raw.old_price > 0
          ? { amount: majorToMinor(raw.old_price, currency), currency }
          : undefined,
      weight: raw.weight ?? undefined,
      inventoryItemId: productId,
      metadata: {
        synthetic: true,
        reason: 'nopCommerce product has no attribute combinations',
        parentProductId: productId,
      },
    })
  }

  const tags: string[] | undefined = Array.isArray(raw.tags)
    ? raw.tags
    : typeof raw.tags === 'string' && raw.tags.length > 0
      ? raw.tags.split(',').map((t) => t.trim())
      : undefined

  return {
    id: productId,
    title: raw.name,
    description: raw.full_description ?? raw.short_description ?? undefined,
    handle: raw.se_name ?? undefined,
    status: mapStatus(raw),
    productType: raw.product_type ?? undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_on_utc,
    updatedAt: raw.updated_on_utc,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → nopCommerce product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    full_description: product.description,
    se_name: product.handle,
    published:
      product.status === 'ACTIVE'
        ? true
        : product.status === 'DRAFT' || product.status === 'ARCHIVED'
          ? false
          : undefined,
  }
  if (product.tags) {
    body['tags'] = product.tags.join(', ')
  }
  if (product.images) {
    body['images'] = product.images.map((i) => ({
      id: i.id,
      src: i.url,
      alt: i.alt,
      position: i.position,
    }))
  }
  // Single-variant product: flatten pricing onto the product body.
  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) body['price'] = v.price.amount
    if (v.compareAtPrice?.amount != null) body['old_price'] = v.compareAtPrice.amount
    if (v.sku) body['sku'] = v.sku
  }
  return body
}

/** Canonical ProductVariant → nopCommerce attribute combination body. */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    sku: variant.sku,
    gtin: variant.barcode,
    overridden_price: variant.price?.amount,
  }
}
