/**
 * VTEX Category → canonical Collection.
 *
 * VTEX organizes products into a category tree via the Catalog API. Each
 * category maps to the canonical Collection type:
 *  - Categories are manually curated → `type: 'MANUAL'`.
 *  - Product IDs are not inlined on the category; callers that need
 *    membership should list products filtered by category.
 *
 * Docs: https://developers.vtex.com/docs/api-reference/catalog-api#get-/api/catalog/pvt/category/-categoryId-
 */

import type { Collection } from '../../../schema/collection'

// ── Raw VTEX shapes ──────────────────────────────────────────────────────────

export interface RawVtexCategory {
  Id: number | string
  Name: string
  FatherCategoryId?: number | string | null
  Title?: string | null
  Description?: string | null
  Keywords?: string | null
  IsActive?: boolean
  LomadeeCampaignCode?: string | null
  AdWordsRemarketingCode?: string | null
  ShowInStoreFront?: boolean
  ShowBrandFilter?: boolean
  ActiveStoreFrontLink?: boolean
  GlobalCategoryId?: number | null
  StockKeepingUnitSelectionMode?: string | null
  Score?: number | null
  ImageUrl?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawVtexCategory): Collection {
  return {
    id: String(raw.Id),
    title: raw.Name,
    description: raw.Description ?? undefined,
    type: 'MANUAL',
    productIds: [],
    image: raw.ImageUrl ? { url: raw.ImageUrl } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    Name: collection.title,
    Description: collection.description ?? '',
    IsActive: true,
    ShowInStoreFront: true,
  }
}
