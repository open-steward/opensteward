/**
 * fabric PIM Product → canonical Product.
 *
 * fabric Products (PIM) expose products via `GET /v3/products`.
 * Each product has `name`, `description`, `slug`, `status`, `sku`,
 * `attributes`, `variants`, and `images`.
 *
 * Status mapping:
 *   - active → ACTIVE
 *   - draft  → DRAFT
 *   - archived → ARCHIVED
 *
 * Pricing is embedded per variant as `price` (decimal) + `currency`.
 * Variants are nested under the product response.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Integer minor units → major-unit decimal for upstream payloads. */
function minorToMajor(money: { amount: number; currency: string } | undefined):
  | number
  | undefined {
  if (money == null) return undefined
  const c = money.currency.toUpperCase()
  const exponent = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2
  return money.amount / 10 ** exponent
}

// ── Raw fabric shapes ────────────────────────────────────────────────────────

export interface RawFabricImage {
  id?: string
  url?: string
  alt_text?: string
  width?: number
  height?: number
  position?: number
  [key: string]: unknown
}

export interface RawFabricVariant {
  id: string
  sku?: string
  title?: string
  price?: number
  compare_at_price?: number
  currency?: string
  weight?: number
  weight_unit?: string
  barcode?: string
  position?: number
  option_values?: Record<string, string>
  taxable?: boolean
  requires_shipping?: boolean
  inventory_item_id?: string
  [key: string]: unknown
}

export interface RawFabricProductOption {
  id?: string
  name?: string
  values?: string[]
  position?: number
  [key: string]: unknown
}

export interface RawFabricProduct {
  id: string
  name?: string
  description?: string
  slug?: string
  status?: string // active | draft | archived
  vendor?: string
  product_type?: string
  tags?: string[]
  sku?: string
  options?: RawFabricProductOption[]
  variants?: RawFabricVariant[]
  images?: RawFabricImage[]
  created_at?: string
  updated_at?: string
  published_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(status: string | undefined): ProductStatus | undefined {
  switch (status) {
    case 'active':
      return 'ACTIVE'
    case 'draft':
      return 'DRAFT'
    case 'archived':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function mapImage(raw: RawFabricImage, idx: number): Image {
  return {
    id: raw.id,
    url: raw.url ?? '',
    alt: raw.alt_text,
    width: raw.width,
    height: raw.height,
    position: raw.position ?? idx,
  }
}

function mapOption(raw: RawFabricProductOption): ProductOption {
  return {
    id: raw.id,
    name: raw.name ?? '',
    values: raw.values ?? [],
    position: raw.position,
  }
}

// ── Variant transform ────────────────────────────────────────────────────────

export function transformVariant(raw: RawFabricVariant, productId: string): ProductVariant {
  return {
    id: raw.id,
    productId,
    sku: raw.sku,
    barcode: raw.barcode,
    title: raw.title,
    price: {
      amount: majorToMinor(raw.price ?? 0, raw.currency ?? 'USD'),
      currency: raw.currency ?? 'USD',
    },
    compareAtPrice:
      raw.compare_at_price != null
        ? { amount: majorToMinor(raw.compare_at_price, raw.currency ?? 'USD'), currency: raw.currency ?? 'USD' }
        : undefined,
    weight: raw.weight,
    weightUnit: raw.weight_unit as ProductVariant['weightUnit'],
    inventoryItemId: raw.inventory_item_id,
    optionValues: raw.option_values,
    taxable: raw.taxable,
    requiresShipping: raw.requires_shipping,
    position: raw.position,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Product transform ────────────────────────────────────────────────────────

export function transformProduct(raw: RawFabricProduct): Product {
  const variants = raw.variants?.map((v) => transformVariant(v, raw.id))
  const images = raw.images?.map((img, idx) => mapImage(img, idx))
  const options = raw.options?.map(mapOption)

  // If no variants, synthesize a default from the product itself
  const resolvedVariants =
    variants && variants.length > 0
      ? variants
      : [
          {
            id: `${raw.id}:default`,
            productId: raw.id,
            sku: raw.sku,
            title: raw.name,
            price: { amount: 0, currency: 'USD' },
            metadata: {
              synthetic: true,
              reason: 'fabric product has no separate variants',
            },
          },
        ]

  return {
    id: raw.id,
    title: raw.name ?? '',
    description: raw.description,
    handle: raw.slug,
    status: mapStatus(raw.status),
    vendor: raw.vendor,
    productType: raw.product_type,
    tags: raw.tags,
    options: options && options.length > 0 ? options : undefined,
    variants: resolvedVariants,
    images: images && images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const variants = product.variants?.map((v) => ({
    sku: v.sku,
    title: v.title,
    price: minorToMajor(v.price),
    currency: v.price?.currency,
    barcode: v.barcode,
    weight: v.weight,
    weight_unit: v.weightUnit,
    option_values: v.optionValues,
    taxable: v.taxable,
    requires_shipping: v.requiresShipping,
  }))

  return {
    name: product.title,
    description: product.description,
    slug: product.handle,
    status: product.status === 'ACTIVE' ? 'active' : product.status === 'ARCHIVED' ? 'archived' : 'draft',
    vendor: product.vendor,
    product_type: product.productType,
    tags: product.tags,
    variants,
  }
}
