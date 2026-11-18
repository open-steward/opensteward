/**
 * Square Catalog ITEM → canonical Product.
 *
 * Square's Catalog API is polymorphic: products are ITEM objects, variants
 * are nested ITEM_VARIATION objects within `item_data.variations[]`.
 */

import type { Product, ProductVariant, ProductOption, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw Square shapes ───────────────────────────────────────────────────────

export interface RawSquareItemVariation {
  id: string
  item_variation_data?: {
    item_id?: string
    name?: string
    sku?: string
    upc?: string
    pricing_type?: string
    price_money?: { amount?: number; currency?: string }
    ordinal?: number
  }
  version?: number
  updated_at?: string
  [key: string]: unknown
}

export interface RawSquareItemOption {
  item_option_id?: string
  name?: string
  values?: Array<{ item_option_value_id?: string; name?: string }>
}

export interface RawSquareCatalogImage {
  id?: string
  image_data?: {
    url?: string
    caption?: string
  }
}

export interface RawSquareCatalogItem {
  id: string
  type: string
  item_data?: {
    name?: string
    description?: string
    abbreviation?: string
    category_id?: string
    product_type?: string
    variations?: RawSquareItemVariation[]
    item_options?: RawSquareItemOption[]
    image_ids?: string[]
    is_archived?: boolean
  }
  version?: number
  created_at?: string
  updated_at?: string
  is_deleted?: boolean
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function squareMoneyToDecimal(
  amount: number | undefined,
  _currency: string = 'USD',
): number {
  // Square reports money in integer minor units (cents), which is exactly the
  // canonical Money.amount representation. Pass the integer through.
  if (amount == null) return 0
  return Math.round(amount)
}

function mapStatus(item: RawSquareCatalogItem): ProductStatus | undefined {
  if (item.is_deleted) return 'ARCHIVED'
  if (item.item_data?.is_archived) return 'ARCHIVED'
  return 'ACTIVE'
}

function mapVariation(raw: RawSquareItemVariation, parentId: string): ProductVariant {
  const data = raw.item_variation_data
  const currency = data?.price_money?.currency ?? 'USD'
  return {
    id: raw.id,
    productId: data?.item_id ?? parentId,
    sku: data?.sku || undefined,
    barcode: data?.upc || undefined,
    title: data?.name,
    price: {
      amount: squareMoneyToDecimal(data?.price_money?.amount, currency),
      currency,
    },
    position: data?.ordinal,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapOption(raw: RawSquareItemOption): ProductOption {
  return {
    id: raw.item_option_id,
    name: raw.name ?? '',
    values: (raw.values ?? []).map((v) => v.name ?? '').filter((v) => v.length > 0),
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformProduct(
  raw: RawSquareCatalogItem,
  images?: RawSquareCatalogImage[],
): Product {
  const itemData = raw.item_data
  const variants = (itemData?.variations ?? []).map((v) => mapVariation(v, raw.id))
  const options = (itemData?.item_options ?? []).map(mapOption)
  const mappedImages: Image[] = (images ?? [])
    .filter((img) => img.image_data?.url)
    .map((img) => ({
      id: img.id,
      url: img.image_data!.url!,
      alt: img.image_data?.caption ?? undefined,
    }))

  return {
    id: raw.id,
    title: itemData?.name ?? '',
    description: itemData?.description ?? undefined,
    status: mapStatus(raw),
    productType: itemData?.product_type || undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: mappedImages.length > 0 ? mappedImages : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Square catalog object body for upsert. */
export function untransformProduct(
  product: Partial<Product>,
  version?: number,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    type: 'ITEM',
    id: product.id ?? '#new-item',
    item_data: {
      name: product.title,
      description: product.description,
      product_type: product.productType,
    },
  }
  if (version != null) (obj as Record<string, unknown>)['version'] = version
  return obj
}
