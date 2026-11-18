/**
 * Virto Commerce CatalogProduct → canonical Product/ProductVariant.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Catalog/swagger.json` →
 * `components.schemas.CatalogProduct` / `Variation` (both share the same
 * shape — a variation is a `CatalogProduct` record with `mainProductId`
 * set, see the adapter's header comment).
 *
 * Pricing is a separate module (`GET /api/products/{id}/prices`) not
 * embedded on `CatalogProduct`, so `transformVariant` requires a resolved
 * `Money` from the caller — see `../index.ts` for how it is fetched per
 * variant. There is no honest default price, so `transformProduct` omits
 * any variation the caller has no resolved price for (rather than
 * fabricating one) — see its own doc comment.
 */
import type { Product, ProductVariant } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import type { Money } from '../../../schema/shared'

export interface RawVirtoImage {
  url?: string
  altText?: string
  sortOrder?: number
}

export interface RawVirtoSeoInfo {
  semanticUrl?: string
  languageCode?: string
}

export interface RawVirtoCatalogProduct {
  id: string
  code?: string
  name: string
  productType?: string
  categoryId?: string
  vendor?: string
  isActive?: boolean
  weight?: number
  weightUnit?: string
  images?: RawVirtoImage[]
  seoInfos?: RawVirtoSeoInfo[]
  variations?: RawVirtoCatalogProduct[]
  mainProductId?: string
  outerId?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

const SLUG_RE = /^[a-z0-9-]+$/

function safeSlug(candidate: string | undefined): string | undefined {
  return candidate && SLUG_RE.test(candidate) ? candidate : undefined
}

function extractImages(raw: RawVirtoCatalogProduct): Image[] | undefined {
  if (!raw.images || raw.images.length === 0) return undefined
  return raw.images
    .filter((img) => !!img.url)
    .map((img) => ({ url: img.url!, alt: img.altText, position: img.sortOrder }))
}

/**
 * `price` is required — the Pricing module is the only source of a real
 * price, and there is no honest default when it reports none. Callers with
 * no resolved price for a given raw record must not call this (see
 * `transformProduct`, which omits such variations, and `../index.ts`'s
 * `getVariant`, which throws instead).
 */
export function transformVariant(raw: RawVirtoCatalogProduct, price: Money): ProductVariant {
  return {
    id: raw.id,
    productId: raw.mainProductId,
    sku: raw.code,
    title: raw.name,
    price,
    weight: raw.weight,
    weightUnit: raw.weightUnit as ProductVariant['weightUnit'],
    metadata: { ...raw },
  }
}

/**
 * @param variantPrices Resolved `Money` per variation id (from the Pricing
 *   module). A variation with no entry here is omitted from the returned
 *   `variants` array entirely — canonical `ProductVariant.price` is
 *   required, and there is no honest default to fabricate one with.
 */
export function transformProduct(
  raw: RawVirtoCatalogProduct,
  variantPrices?: Record<string, Money>,
): Product {
  const handle = safeSlug(raw.seoInfos?.find((s) => s.semanticUrl)?.semanticUrl)
  const variants = raw.variations
    ?.filter((v) => variantPrices?.[v.id] != null)
    .map((v) => transformVariant(v, variantPrices![v.id]!))
  return {
    id: raw.id,
    title: raw.name,
    handle,
    // `isActive` unreported means unknown, not active — leave status unset.
    status: raw.isActive == null ? undefined : raw.isActive ? 'ACTIVE' : 'ARCHIVED',
    vendor: raw.vendor,
    productType: raw.productType,
    images: extractImages(raw),
    variants: variants && variants.length > 0 ? variants : undefined,
    createdAt: raw.createdDate,
    updatedAt: raw.modifiedDate,
    metadata: { ...raw },
  }
}

/** Canonical Product → Virto CatalogProduct create/update body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title != null) body['name'] = product.title
  if (product.vendor != null) body['vendor'] = product.vendor
  if (product.productType != null) body['productType'] = product.productType
  if (product.status != null) body['isActive'] = product.status === 'ACTIVE'
  const meta = product.metadata ?? {}
  if (meta['categoryId'] != null) body['categoryId'] = meta['categoryId']
  if (meta['catalogId'] != null) body['catalogId'] = meta['catalogId']
  return body
}
