/**
 * WooCommerce ProductCategory → canonical Collection.
 *
 * WooCommerce's closest analogue to a Shopify collection is the product
 * category taxonomy. All WC categories are manually curated (there is no
 * "smart" rule-based category), so we hardcode `type: 'MANUAL'`.
 *
 * WC categories don't inline their member product ids — products
 * reference categories, not the other way around — so `productIds`
 * stays empty. Callers that need category membership should list
 * products filtered by category id.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawWooCommerceCategoryImage {
  id?: number | string
  src?: string
  name?: string | null
  alt?: string | null
}

export interface RawWooCommerceCategory {
  id: number | string
  name: string
  slug?: string
  parent?: number | string | null
  description?: string
  display?: string
  image?: RawWooCommerceCategoryImage | null
  menu_order?: number
  count?: number
  [key: string]: unknown
}

function mapImage(img: RawWooCommerceCategoryImage | null | undefined): Image | undefined {
  if (!img || !img.src) return undefined
  return {
    id: img.id != null ? String(img.id) : undefined,
    url: img.src,
    alt: img.alt ?? img.name ?? undefined,
  }
}

export function transformCollection(raw: RawWooCommerceCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug,
    description: raw.description,
    type: 'MANUAL',
    productIds: [],
    image: mapImage(raw.image),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
  }
  if (collection.image?.url) {
    body['image'] = { src: collection.image.url, alt: collection.image.alt }
  }
  return body
}
