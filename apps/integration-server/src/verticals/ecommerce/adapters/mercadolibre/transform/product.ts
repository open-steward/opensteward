/**
 * Mercado Libre Item → canonical Product.
 *
 * Mercado Libre's Items API models products as "items" keyed by a
 * platform-generated ID (e.g. "MLA123456789"). Sellers create items
 * via POST /items and update via PUT /items/{id}.
 *
 * Canonical `Product.id` = ML item ID.
 *
 * ML items have:
 *   - title, description (separate endpoint), category_id
 *   - pictures[] with url, secure_url, size
 *   - attributes[] with id, name, value_name (brand, model, etc.)
 *   - variations[] (mapped to variants separately)
 *   - status: active, paused, closed, under_review, inactive
 *   - price, currency_id, available_quantity
 */

import type { Product, ProductStatus } from '../../../schema/product'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliPicture {
  id: string
  url: string
  secure_url: string
  size?: string
  max_size?: string
  quality?: string
}

export interface RawMeliAttribute {
  id: string
  name?: string
  value_id?: string | null
  value_name?: string | null
  attribute_group_id?: string
  attribute_group_name?: string
}

export interface RawMeliVariation {
  id: number
  price?: number
  attribute_combinations?: RawMeliAttribute[]
  available_quantity?: number
  sold_quantity?: number
  picture_ids?: string[]
  catalog_product_id?: string | null
}

export interface RawMeliItem {
  id: string
  site_id?: string
  title: string
  subtitle?: string | null
  seller_id?: number
  category_id?: string
  price?: number
  base_price?: number
  original_price?: number | null
  currency_id?: string
  initial_quantity?: number
  available_quantity?: number
  sold_quantity?: number
  buying_mode?: string
  listing_type_id?: string
  condition?: string
  permalink?: string
  thumbnail?: string
  secure_thumbnail?: string
  pictures?: RawMeliPicture[]
  video_id?: string | null
  descriptions?: Array<{ id: string }>
  status?: string
  sub_status?: string[]
  tags?: string[]
  warranty?: string
  catalog_product_id?: string | null
  domain_id?: string
  seller_address?: Record<string, unknown>
  attributes?: RawMeliAttribute[]
  variations?: RawMeliVariation[]
  date_created?: string
  last_updated?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map ML item status to canonical ProductStatus.
 * ML statuses: active, paused, closed, under_review, inactive
 */
function mapStatus(status: string | undefined): ProductStatus | undefined {
  switch (status) {
    case 'active':
      return 'ACTIVE'
    case 'paused':
    case 'under_review':
      return 'DRAFT'
    case 'closed':
    case 'inactive':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function extractImages(item: RawMeliItem): Image[] | undefined {
  const pics = item.pictures
  if (!pics || pics.length === 0) return undefined
  return pics.map((pic, i) => ({
    id: pic.id,
    url: pic.secure_url || pic.url,
    position: i,
  }))
}

function findAttribute(
  attrs: RawMeliAttribute[] | undefined,
  id: string,
): string | undefined {
  if (!attrs) return undefined
  const attr = attrs.find((a) => a.id === id)
  return attr?.value_name ?? undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Mercado Libre Item → canonical Product.
 */
export function transformProduct(raw: RawMeliItem): Product {
  const images = extractImages(raw)
  const brand = findAttribute(raw.attributes, 'BRAND')
  const productType = findAttribute(raw.attributes, 'ITEM_CONDITION') ?? raw.condition

  return {
    id: raw.id,
    title: raw.title,
    description: undefined, // Description requires a separate API call in ML
    handle: toSlug(raw.permalink),
    status: mapStatus(raw.status),
    vendor: brand,
    productType,
    tags: raw.tags,
    images,
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(raw.last_updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Mercado Libre Item POST/PUT body.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (data.title) body['title'] = data.title
  if (data.images) {
    body['pictures'] = data.images.map((img) => ({ source: img.url }))
  }

  // Map status back to ML
  if (data.status) {
    switch (data.status) {
      case 'ACTIVE':
        body['status'] = 'active'
        break
      case 'DRAFT':
        body['status'] = 'paused'
        break
      case 'ARCHIVED':
        body['status'] = 'closed'
        break
    }
  }

  // Pass through raw attributes from metadata
  const rawMeta = data.metadata
  if (rawMeta) {
    if (rawMeta['category_id']) body['category_id'] = rawMeta['category_id']
    if (rawMeta['price']) body['price'] = rawMeta['price']
    if (rawMeta['currency_id']) body['currency_id'] = rawMeta['currency_id']
    if (rawMeta['available_quantity']) body['available_quantity'] = rawMeta['available_quantity']
    if (rawMeta['buying_mode']) body['buying_mode'] = rawMeta['buying_mode']
    if (rawMeta['condition']) body['condition'] = rawMeta['condition']
    if (rawMeta['listing_type_id']) body['listing_type_id'] = rawMeta['listing_type_id']
  }

  return body
}
