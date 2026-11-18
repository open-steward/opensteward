/**
 * commercetools Product / ProductProjection → canonical Product.
 *
 * commercetools has two distinct product shapes:
 *  - `Product`            — the authoring model. Has `masterData.current`
 *                           and `masterData.staged` (plus `version`).
 *  - `ProductProjection`  — the flattened read model. This is what
 *                           storefronts consume and what our adapter uses
 *                           for reads (`GET /product-projections`).
 *
 * `transformProduct` accepts either shape: if it sees `masterData`, it
 * unwraps `current`; otherwise it treats the input as a projection.
 *
 * Localization: commercetools stores user-visible strings as
 * `LocalizedString` maps, e.g. `name: {'en-US': 'Coffee', 'de-DE': 'Kaffee'}`.
 * The canonical schema uses plain `string` fields, so we flatten via
 * {@link pickLocalized} and preserve the full locale map in
 * `metadata.localizedStrings` for downstream consumers.
 *
 * Variants: `masterVariant` is prepended to the canonical `variants[]`
 * array with `position: 1`. Subsequent `variants[]` carry their native
 * order (`position: 2…N`).
 *
 * Updates: commercetools mutates resources via action arrays
 * (`POST /products/{id}` with `{version, actions: []}`). The adapter uses
 * {@link buildActionsForProduct} to translate a canonical partial update
 * into the corresponding action list.
 */

import type {
  Product,
  ProductOption,
  ProductStatus,
  ProductVariant,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { DEFAULT_LOCALE } from '../constants'
import {
  pickLocalized,
  transformVariant,
  type RawCtImage,
  type RawCtLocalizedString,
  type RawCtVariant,
} from './variant'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawCtCategoryReference {
  id: string
  typeId: 'category'
}

export interface RawCtProductProjection {
  id: string
  version?: number
  key?: string
  name: RawCtLocalizedString
  description?: RawCtLocalizedString
  slug?: RawCtLocalizedString
  masterVariant: RawCtVariant
  variants?: RawCtVariant[]
  productType?: { id: string; typeId: 'product-type' }
  categories?: RawCtCategoryReference[]
  searchKeywords?: Record<string, Array<{ text: string }>>
  published?: boolean
  hasStagedChanges?: boolean
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export interface RawCtProduct {
  id: string
  version: number
  key?: string
  productType?: { id: string; typeId: 'product-type' }
  masterData: {
    current: RawCtProductProjection
    staged: RawCtProductProjection
    published: boolean
    hasStagedChanges?: boolean
  }
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export type RawCommerceToolsProduct = RawCtProduct
export type RawCommerceToolsProductProjection = RawCtProductProjection

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Unwrap a ProductProjection from either shape. Accepts both a fully
 * flat `ProductProjection` and the authoring `Product` with nested
 * `masterData.current`.
 */
function unwrapProjection(
  raw: RawCtProduct | RawCtProductProjection,
): { projection: RawCtProductProjection; productId: string } {
  if ('masterData' in raw && raw.masterData && typeof raw.masterData === 'object') {
    const product = raw as RawCtProduct
    return {
      projection: {
        ...product.masterData.current,
        id: product.id,
        published: product.masterData.published,
        hasStagedChanges: product.masterData.hasStagedChanges,
      },
      productId: product.id,
    }
  }
  return { projection: raw as RawCtProductProjection, productId: (raw as RawCtProductProjection).id }
}

function mapStatus(published: boolean | undefined): ProductStatus | undefined {
  if (published === true) return 'ACTIVE'
  if (published === false) return 'DRAFT'
  return undefined
}

function mapImage(img: RawCtImage, position: number): Image {
  return {
    url: img.url,
    alt: img.label,
    width: img.dimensions?.w,
    height: img.dimensions?.h,
    position,
  }
}

/**
 * Derive canonical ProductOptions from the union of all variant attribute
 * values. commercetools stores the schema (per ProductType) separately,
 * but for read purposes we can reconstruct options by walking variants.
 */
function buildOptions(variants: ProductVariant[]): ProductOption[] | undefined {
  const buckets = new Map<string, Set<string>>()
  for (const v of variants) {
    if (!v.optionValues) continue
    for (const [name, value] of Object.entries(v.optionValues)) {
      if (!buckets.has(name)) buckets.set(name, new Set())
      buckets.get(name)!.add(value)
    }
  }
  if (buckets.size === 0) return undefined
  let i = 1
  const out: ProductOption[] = []
  for (const [name, values] of buckets) {
    out.push({ name, values: Array.from(values), position: i++ })
  }
  return out
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformProduct(
  raw: RawCtProduct | RawCtProductProjection,
  locale: string = DEFAULT_LOCALE,
): Product {
  const { projection, productId } = unwrapProjection(raw)
  const title = pickLocalized(projection.name, locale) ?? ''
  const description = pickLocalized(projection.description, locale)
  const handle = pickLocalized(projection.slug, locale)

  // Variants: master is position 1, rest follow.
  const masterCanonical = transformVariant(projection.masterVariant, productId, 1)
  const extras = (projection.variants ?? []).map((v, idx) =>
    transformVariant(v, productId, idx + 2),
  )
  const variants: ProductVariant[] = [masterCanonical, ...extras]

  // Images live on each variant in commercetools; surface the master
  // variant's images as the canonical product images so the canonical
  // shape matches Shopify/WooCommerce expectations.
  const images = (projection.masterVariant.images ?? []).map((img, idx) =>
    mapImage(img, idx + 1),
  )

  const productType =
    typeof projection.productType === 'object' && projection.productType !== null
      ? projection.productType.id
      : undefined

  const options = buildOptions(variants)
  const tags = projection.categories?.map((c) => c.id)
  const localizedStrings = {
    name: projection.name,
    description: projection.description,
    slug: projection.slug,
  }

  return {
    id: productId,
    title,
    description,
    handle,
    status: mapStatus(projection.published),
    productType,
    tags: tags && tags.length > 0 ? tags : undefined,
    options,
    variants,
    images: images.length > 0 ? images : undefined,
    createdAt: projection.createdAt,
    updatedAt: projection.lastModifiedAt,
    publishedAt: projection.published ? projection.createdAt : undefined,
    metadata: {
      ...(raw as unknown as Record<string, unknown>),
      localizedStrings,
    },
  }
}

/**
 * Canonical Product → commercetools `ProductDraft` body for
 * `POST /products`. The caller must ensure the product-type reference is
 * present in `data.metadata.productTypeId` — commercetools will 400
 * without it.
 */
export function untransformProduct(
  product: Partial<Product>,
  locale: string = DEFAULT_LOCALE,
): Record<string, unknown> {
  const name = product.title ? { [locale]: product.title } : undefined
  const description = product.description ? { [locale]: product.description } : undefined
  const slug = product.handle ? { [locale]: product.handle } : undefined

  const productTypeId =
    (product.metadata?.['productTypeId'] as string | undefined) ?? product.productType

  const masterVariant: Record<string, unknown> = {}
  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    if (v.sku) masterVariant['sku'] = v.sku
    if (v.price) {
      masterVariant['prices'] = [
        {
          value: {
            type: 'centPrecision',
            currencyCode: v.price.currency,
            centAmount: Math.round(v.price.amount),
          },
        },
      ]
    }
  }

  const extraVariants =
    product.variants && product.variants.length > 1
      ? product.variants.slice(1).map((v) => ({
          sku: v.sku,
          prices: v.price
            ? [
                {
                  value: {
                    type: 'centPrecision',
                    currencyCode: v.price.currency,
                    centAmount: Math.round(v.price.amount),
                  },
                },
              ]
            : undefined,
        }))
      : undefined

  const body: Record<string, unknown> = {
    name,
    description,
    slug,
    productType: productTypeId
      ? { typeId: 'product-type', id: productTypeId }
      : undefined,
    masterVariant: Object.keys(masterVariant).length > 0 ? masterVariant : undefined,
    variants: extraVariants,
    publish: product.status === 'ACTIVE' ? true : undefined,
  }
  return body
}

/**
 * Translate a canonical partial Product update into commercetools update
 * actions. commercetools rejects unknown action fields, so only fields
 * the caller explicitly provided produce actions.
 *
 * Actions emitted:
 *  - `changeName`        when `title` is set
 *  - `setDescription`    when `description` is set
 *  - `changeSlug`        when `handle` is set
 *  - `publish`/`unpublish` when `status` is set
 */
export function buildActionsForProduct(
  _current: RawCtProduct | RawCtProductProjection,
  updates: Partial<Product>,
  locale: string = DEFAULT_LOCALE,
): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = []
  if (updates.title !== undefined) {
    actions.push({ action: 'changeName', name: { [locale]: updates.title } })
  }
  if (updates.description !== undefined) {
    actions.push({
      action: 'setDescription',
      description: { [locale]: updates.description },
    })
  }
  if (updates.handle !== undefined) {
    actions.push({ action: 'changeSlug', slug: { [locale]: updates.handle } })
  }
  if (updates.status === 'ACTIVE') actions.push({ action: 'publish' })
  if (updates.status === 'DRAFT') actions.push({ action: 'unpublish' })
  return actions
}
