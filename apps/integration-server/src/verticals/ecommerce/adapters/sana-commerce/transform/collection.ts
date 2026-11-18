/**
 * Sana Commerce product category → canonical Collection.
 *
 * Sana Commerce calls product categories "product groups" or "categories".
 * They are fetched via:
 *  GET `catalog/productcategories`
 *
 * Each category maps cleanly to a canonical Collection (type MANUAL — Sana
 * does not have rule-based collections). Categories may have a parent
 * (hierarchical), which is stored in metadata.
 *
 * Docs:
 *  https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/api-methods
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawSanaCategory {
  Id?: number | string | null
  id?: number | string | null
  Title?: string | null
  title?: string | null
  Name?: string | null
  name?: string | null
  Description?: string | null
  description?: string | null
  UrlName?: string | null
  urlName?: string | null
  ImageUrl?: string | null
  imageUrl?: string | null
  ParentId?: number | string | null
  parentId?: number | string | null
  SortOrder?: number | null
  sortOrder?: number | null
  [key: string]: unknown
}

function str(v: string | number | null | undefined): string | undefined {
  if (v == null) return undefined
  return String(v).trim() || undefined
}

function mapImage(url: string | null | undefined): Image | undefined {
  if (!url) return undefined
  return { url }
}

export function transformCollection(raw: RawSanaCategory): Collection {
  const id = str(raw.Id ?? raw.id) ?? ''
  const title = str(raw.Title ?? raw.title ?? raw.Name ?? raw.name) ?? ''
  const handle = str(raw.UrlName ?? raw.urlName)
  const description = str(raw.Description ?? raw.description)
  const imageUrl = str(raw.ImageUrl ?? raw.imageUrl)

  return {
    id,
    title,
    handle,
    description,
    type: 'MANUAL',
    image: mapImage(imageUrl),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
