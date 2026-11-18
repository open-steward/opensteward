/**
 * Ordergroove Product → canonical Product.
 *
 * Ordergroove mirrors a subset of the merchant's storefront catalog so it can
 * attach subscription behaviour to individual SKUs — there is no variant
 * concept (`external_product_id` addresses one purchasable item directly)
 * and no single-item create endpoint (only `Bulk Create` at
 * `/products/bulk_create/`, out of scope here); `price` also has no home on
 * the canonical `Product` (it belongs on a variant, which this platform
 * doesn't have) so it round-trips through `metadata` only, matching the
 * established convention for variant-less platforms (see e.g.
 * `adapters/gumroad/transform/product.ts`).
 *
 * Example bodies confirmed verbatim at
 * https://developer.ordergroove.com/reference/products-list and
 * https://developer.ordergroove.com/reference/products-retrieve (fetched
 * 2026-09-13). Update fields confirmed at
 * https://developer.ordergroove.com/reference/products-update
 * (`PATCH /products/{external_product_id}/`).
 */
import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawOrdergrooveProductGroup {
  name: string
  group_type: string
}

export interface RawOrdergrooveProduct {
  merchant?: string
  groups?: RawOrdergrooveProductGroup[]
  name: string
  price?: string | number
  image_url?: string | null
  detail_url?: string | null
  external_product_id: string
  sku?: string | null
  autoship_enabled?: boolean
  premier_enabled?: number | boolean
  created?: string
  last_update?: string
  live?: boolean
  discontinued?: boolean
  extra_data?: unknown
  product_type?: string | null
  autoship_by_default?: boolean
  every?: number | null
  every_period?: number | null
  offer_profile?: unknown
  incentive_group?: unknown
  [key: string]: unknown
}

function mapStatus(raw: RawOrdergrooveProduct): ProductStatus | undefined {
  if (raw.discontinued) return 'ARCHIVED'
  if (raw.live === true) return 'ACTIVE'
  if (raw.live === false) return 'DRAFT'
  return undefined
}

function mapImages(raw: RawOrdergrooveProduct): Image[] | undefined {
  if (!raw.image_url) return undefined
  return [{ url: raw.image_url }]
}

export function transformProduct(raw: RawOrdergrooveProduct): Product {
  const tags = raw.groups && raw.groups.length > 0 ? raw.groups.map((g) => g.name) : undefined

  return {
    id: raw.external_product_id,
    title: raw.name,
    status: mapStatus(raw),
    productType: raw.product_type ?? undefined,
    tags,
    images: mapImages(raw),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.last_update),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → `PATCH /products/{external_product_id}/` body.
 *
 * None of the documented update fields (`autoship_enabled`,
 * `prepaid_eligible`, `autoship_by_default`, `upsell_eligible`, `price`,
 * `type`) has a canonical `Product` counterpart, so — matching the
 * `gumroad`/`insales` convention for platform-specific write fields — they
 * are read back out of `product.metadata` when present.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const meta = (product.metadata ?? {}) as Record<string, unknown>

  for (const key of [
    'autoship_enabled',
    'prepaid_eligible',
    'autoship_by_default',
    'upsell_eligible',
    'price',
    'type',
  ]) {
    if (meta[key] !== undefined) body[key] = meta[key]
  }

  return body
}
