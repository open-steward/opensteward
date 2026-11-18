/**
 * Vendure Product -> canonical Product.
 *
 * Vendure products have nested variants and channel-scoped pricing.
 * Prices are stored as integers in the smallest currency unit (cents).
 * Product status is derived from channel assignment: if enabled on the
 * current channel -> ACTIVE, otherwise -> DRAFT.
 */

import type { Product, ProductOption, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { transformVariant, type RawVendureVariant } from './variant'

// -- Raw Vendure shapes ------------------------------------------------------

export interface RawVendureAsset {
  id?: string
  source?: string
  preview?: string
  name?: string
  [key: string]: unknown
}

export interface RawVendureOptionGroup {
  id?: string
  name?: string
  code?: string
  options?: Array<{ id?: string; name?: string; code?: string }>
}

export interface RawVendureFacetValue {
  id?: string
  name?: string
  code?: string
  facet?: { id?: string; name?: string; code?: string }
}

export interface RawVendureProduct {
  id: string
  name: string
  description?: string | null
  slug?: string
  enabled?: boolean
  optionGroups?: RawVendureOptionGroup[]
  variants?: RawVendureVariant[]
  featuredAsset?: RawVendureAsset | null
  assets?: RawVendureAsset[]
  facetValues?: RawVendureFacetValue[]
  channels?: Array<{ id?: string; code?: string }> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// -- Helpers -----------------------------------------------------------------

function mapStatus(raw: RawVendureProduct): ProductStatus | undefined {
  if (raw.enabled === true) return 'ACTIVE'
  if (raw.enabled === false) return 'DRAFT'
  return undefined
}

function mapImage(raw: RawVendureAsset): Image {
  return {
    id: raw.id,
    url: raw.preview ?? raw.source ?? '',
    alt: raw.name ?? undefined,
  }
}

function mapOptions(groups: RawVendureOptionGroup[] | undefined): ProductOption[] | undefined {
  if (!groups || groups.length === 0) return undefined
  const opts: ProductOption[] = []
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!
    if (!group.name) continue
    opts.push({
      id: group.id,
      name: group.name,
      values: (group.options ?? []).map((o) => o.name ?? o.code ?? ''),
      position: i + 1,
    })
  }
  return opts.length > 0 ? opts : undefined
}

// -- Transform ---------------------------------------------------------------

export function transformProduct(raw: RawVendureProduct, currency: string = 'USD'): Product {
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, currency))
  const allAssets = raw.assets ?? (raw.featuredAsset ? [raw.featuredAsset] : [])
  const images = allAssets.filter((a) => a != null).map(mapImage)
  const options = mapOptions(raw.optionGroups)
  const tags = raw.facetValues
    ?.map((fv) => fv.name ?? fv.code ?? '')
    .filter((t) => t.length > 0)

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.description ?? undefined,
    handle: raw.slug,
    status: mapStatus(raw),
    options,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  if (product.title != null) input['name'] = product.title
  if (product.description != null) input['description'] = product.description
  if (product.handle != null) input['slug'] = product.handle
  if (product.status != null) input['enabled'] = product.status === 'ACTIVE'
  return input
}
