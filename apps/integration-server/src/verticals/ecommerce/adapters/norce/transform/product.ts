/**
 * Maps Norce Commerce Query's `Product` entity (Products/Products) to the
 * canonical Product shape.
 *
 * Field names below are taken verbatim from the published OpenAPI schema for
 * `Enferno.Storm.Query.Api.DataContexts.ProductModel.Product`:
 * https://docs.norce.io/api-reference/query/queryproducts/openapi
 *
 * Deliberately NOT mapped: `variants` / `images`. A `Product.Skus` /
 * `Variant` record carries no direct selling price — price lives on a
 * separate `ProductSkuPricelist` keyed by `CurrencyId`, itself requiring a
 * join against Core's `Currency` entity for an ISO code — so a valid
 * canonical `ProductVariant` (whose `price` field is required) cannot be
 * assembled from a single documented endpoint. See the adapter's
 * `metadata.ts` for the full reasoning; `variant` is declared unavailable.
 */
import { toIsoDatetime, toSlug } from '@opensteward/shared'
import type { Product } from '../../../schema/product'

export interface RawNorceProduct {
  Id: number
  Code?: string | null
  DefaultName?: string | null
  DefaultDescription?: string | null
  DefaultUniqueUrlName?: string | null
  DefaultTags?: string | null
  ManufacturerPartNo?: string | null
  IsActive?: boolean | null
  Created?: string | number | null
  Updated?: string | number | null
  [key: string]: unknown
}

export function transformProduct(raw: RawNorceProduct): Product {
  const tags = raw.DefaultTags
    ? raw.DefaultTags.split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined

  return {
    id: String(raw.Id),
    title: raw.DefaultName?.trim() || raw.Code?.trim() || String(raw.Id),
    description: raw.DefaultDescription ?? undefined,
    handle: toSlug(raw.DefaultUniqueUrlName ?? raw.Code ?? undefined),
    status: raw.IsActive === false ? 'ARCHIVED' : 'ACTIVE',
    tags,
    createdAt: toIsoDatetime(raw.Created),
    updatedAt: toIsoDatetime(raw.Updated),
    metadata: raw as Record<string, unknown>,
  }
}
