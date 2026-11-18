/**
 * Etsy Listing → canonical Product.
 *
 * Etsy calls products "listings". A listing has a `listing_id` (numeric),
 * a `title`, `description`, `state` (active/inactive/draft/expired/sold_out),
 * `price` (as a money object), `tags`, and `images` (fetched separately or
 * included via `includes` parameter).
 *
 * Key mapping decisions:
 *  - `listing_id` (stringified) → canonical `id`
 *  - `state` → canonical `status` (active→ACTIVE, draft→DRAFT, rest→ARCHIVED)
 *  - `shop_section_id` surfaces via metadata, not as a collection
 *  - `taxonomy_id` → `productType` (as string)
 *  - Variants are NOT modelled — Etsy variations are property_id+value_id pairs
 *    embedded in the inventory resource, not a separate CRUD. All variant methods → 501.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { toSlug } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEtsyMoney {
  amount: number
  divisor: number
  currency_code: string
}

export interface RawEtsyImage {
  listing_image_id?: number
  listing_id?: number
  url_75x75?: string
  url_170x135?: string
  url_570xN?: string
  url_fullxfull?: string
  full_height?: number
  full_width?: number
  rank?: number
  [key: string]: unknown
}

export interface RawEtsyListing {
  listing_id: number
  title?: string
  description?: string
  state?: string
  url?: string
  tags?: string[]
  price?: RawEtsyMoney
  taxonomy_id?: number
  shop_section_id?: number | null
  featured_rank?: number
  who_made?: string
  when_made?: string
  is_supply?: boolean
  item_weight?: number | null
  item_weight_unit?: string | null
  quantity?: number
  views?: number
  num_favorers?: number
  images?: RawEtsyImage[]
  creation_tsz?: number
  created_timestamp?: number
  last_modified_tsz?: number
  updated_timestamp?: number
  ending_tsz?: number
  original_creation_tsz?: number
  shop_id?: number
  user_id?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Etsy listing state to canonical product status.
 *
 * Etsy states: active, inactive, draft, expired, sold_out, removed, edit.
 * - active → ACTIVE
 * - draft, edit → DRAFT
 * - inactive, expired, sold_out, removed → ARCHIVED
 */
export function mapListingState(state: string | undefined): ProductStatus | undefined {
  if (!state) return undefined
  switch (state.toLowerCase()) {
    case 'active':
      return 'ACTIVE'
    case 'draft':
    case 'edit':
      return 'DRAFT'
    case 'inactive':
    case 'expired':
    case 'sold_out':
    case 'removed':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

/**
 * Convert Etsy's money format (amount in smallest unit + divisor) to a
 * human-readable decimal. Example: {amount: 1999, divisor: 100} = 19.99.
 */
export function etsyMoneyToDecimal(money: RawEtsyMoney | undefined): number | undefined {
  if (!money || money.divisor === 0) return undefined
  return money.amount / money.divisor
}

function extractImages(listing: RawEtsyListing): Image[] | undefined {
  const raw = listing.images
  if (!raw || raw.length === 0) return undefined
  return raw.map((img, i) => ({
    id: img.listing_image_id != null ? String(img.listing_image_id) : undefined,
    url: img.url_fullxfull ?? img.url_570xN ?? img.url_170x135 ?? img.url_75x75 ?? '',
    width: img.full_width ?? undefined,
    height: img.full_height ?? undefined,
    position: img.rank ?? i,
  }))
}

function tsToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Etsy Listing → canonical Product.
 */
export function transformProduct(raw: RawEtsyListing): Product {
  const images = extractImages(raw)

  const metadata: Record<string, unknown> = {
    ...(raw as unknown as Record<string, unknown>),
  }

  return {
    id: String(raw.listing_id),
    title: raw.title ?? String(raw.listing_id),
    description: raw.description ?? undefined,
    handle: toSlug(raw.url),
    status: mapListingState(raw.state),
    vendor: undefined,
    productType: raw.taxonomy_id != null ? String(raw.taxonomy_id) : undefined,
    tags: raw.tags ?? undefined,
    images,
    createdAt: tsToIso(raw.created_timestamp ?? raw.creation_tsz),
    updatedAt: tsToIso(raw.updated_timestamp ?? raw.last_modified_tsz),
    metadata,
  }
}

/**
 * Canonical Product → Etsy listing create/update body.
 *
 * Etsy's create listing endpoint requires: title, description, price,
 * quantity, who_made, when_made, taxonomy_id, and is_supply at minimum.
 * This untransform provides reasonable defaults for the required fields
 * that are not present on the canonical Product type.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (product.title != null) body['title'] = product.title
  if (product.description != null) body['description'] = product.description
  if (product.tags != null) body['tags'] = product.tags

  // Pass through Etsy-specific fields from metadata
  const meta = product.metadata ?? {}
  if (meta['quantity'] != null) body['quantity'] = meta['quantity']
  if (meta['price'] != null) body['price'] = meta['price']
  if (meta['who_made'] != null) body['who_made'] = meta['who_made']
  if (meta['when_made'] != null) body['when_made'] = meta['when_made']
  if (meta['taxonomy_id'] != null) body['taxonomy_id'] = meta['taxonomy_id']
  if (meta['is_supply'] != null) body['is_supply'] = meta['is_supply']
  if (meta['shipping_profile_id'] != null) body['shipping_profile_id'] = meta['shipping_profile_id']

  return body
}
