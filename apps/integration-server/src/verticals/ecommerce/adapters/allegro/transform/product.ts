/**
 * Allegro Offer → canonical Product.
 *
 * Allegro's Sale Offers API models products as "offers" — each offer has
 * a title, description, images, pricing, and category. The offer `id` is
 * a string identifier assigned by Allegro.
 *
 * Canonical `Product.id` = Allegro offer id.
 *
 * API: GET /sale/offers, GET /sale/offers/{offerId}
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAllegroImage {
  url: string
}

export interface RawAllegroParameter {
  id: string
  name?: string
  values?: Array<{ value?: string }>
  valuesIds?: string[]
}

export interface RawAllegroPrice {
  amount: string
  currency: string
}

export interface RawAllegroSellingMode {
  format?: string
  price?: RawAllegroPrice
  minimalPrice?: RawAllegroPrice
  startingPrice?: RawAllegroPrice
}

export interface RawAllegroStock {
  available?: number
  sold?: number
}

export interface RawAllegroCategory {
  id: string
}

export interface RawAllegroOffer {
  id: string
  name?: string
  description?: {
    sections?: Array<{
      items?: Array<{
        type?: string
        content?: string
      }>
    }>
  }
  category?: RawAllegroCategory
  parameters?: RawAllegroParameter[]
  images?: RawAllegroImage[]
  sellingMode?: RawAllegroSellingMode
  stock?: RawAllegroStock
  publication?: {
    status?: string
    startingAt?: string
    endingAt?: string
  }
  external?: {
    id?: string
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Allegro publication status to canonical product status.
 * Allegro statuses: ACTIVE, ENDED, ACTIVATING, INACTIVE
 */
export function mapStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE'
    case 'ACTIVATING':
      return 'DRAFT'
    case 'INACTIVE':
      return 'ARCHIVED'
    case 'ENDED':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function extractImages(offer: RawAllegroOffer): Image[] | undefined {
  const imgs = offer.images
  if (!imgs || imgs.length === 0) return undefined
  return imgs.map((img, i) => ({
    url: img.url,
    position: i,
  }))
}

/**
 * Extract a plain-text description from Allegro's structured description
 * sections. Allegro uses a sections/items model with TEXT and IMAGE types.
 */
function extractDescription(offer: RawAllegroOffer): string | undefined {
  if (!offer.description?.sections) return undefined
  const texts: string[] = []
  for (const section of offer.description.sections) {
    for (const item of section.items ?? []) {
      if (item.type === 'TEXT' && item.content) {
        texts.push(item.content)
      }
    }
  }
  return texts.length > 0 ? texts.join('\n') : undefined
}

/**
 * Extract brand from Allegro parameters (parameter with name "Marka" or id for brand).
 */
function extractBrand(params: RawAllegroParameter[] | undefined): string | undefined {
  if (!params) return undefined
  const brand = params.find(
    (p) => p.name?.toLowerCase() === 'marka' || p.name?.toLowerCase() === 'brand',
  )
  return brand?.values?.[0]?.value
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Allegro Offer → canonical Product.
 */
export function transformProduct(raw: RawAllegroOffer): Product {
  const images = extractImages(raw)
  const description = extractDescription(raw)
  const brand = extractBrand(raw.parameters)

  return {
    id: raw.id,
    title: raw.name ?? raw.id,
    description,
    status: mapStatus(raw.publication?.status),
    vendor: brand,
    productType: raw.category?.id,
    images,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Allegro Offer creation/update body.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (data.title) body['name'] = data.title
  if (data.description) {
    body['description'] = {
      sections: [
        {
          items: [{ type: 'TEXT', content: data.description }],
        },
      ],
    }
  }
  if (data.images) {
    body['images'] = data.images.map((img) => ({ url: img.url }))
  }
  if (data.productType) {
    body['category'] = { id: data.productType }
  }

  // Preserve raw metadata fields that the caller may have set
  const raw = data.metadata as Record<string, unknown> | undefined
  if (raw?.['sellingMode']) body['sellingMode'] = raw['sellingMode']
  if (raw?.['stock']) body['stock'] = raw['stock']
  if (raw?.['parameters']) body['parameters'] = raw['parameters']
  if (raw?.['publication']) body['publication'] = raw['publication']

  return body
}
