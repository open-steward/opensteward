/**
 * IdoSell Product (+ sizes-as-variants) → canonical Product.
 *
 * Shapes verified against the OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/productsproductsget (GET, id-batch
 * lookup and the shape shared by the search endpoint) and
 * https://idosell.readme.io/reference/productsproductssearchpost (POST,
 * general paginated list) — both return the same product object shape.
 *
 * IdoSell stores product names/descriptions per language
 * (`productDescriptionsLangData[]`) rather than a single field; a `lang`
 * preference picks the entry to surface (default: the first entry).
 *
 * "Sizes as variants": IdoSell does not model color/style options, only a
 * flat list of sizes. `productSizesAttributes[]` (per-size external code,
 * producer code and price) is preferred over the thinner `productSizes[]`
 * (id + name only) when present. `ProductVariantSchema.price` is a required
 * field, so a size that resolves to no real price (neither its own
 * `productRetailPrice` nor the product's) is dropped from `variants` rather
 * than published with an invented amount.
 */

import type { Product, ProductVariant } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import type { RawIdosellProductStocksData } from './inventory'

export interface RawIdosellLangEntry {
  langId?: string
  productName?: string
  productDescription?: string
  productLongDescription?: string
}

export interface RawIdosellProductSize {
  sizeId?: string
  sizePanelName?: string
}

export interface RawIdosellProductSizeAttribute {
  sizeId?: string
  sizePanelName?: string
  productSizeCodeExternal?: string
  productSizeCodeProducer?: string
  productRetailPrice?: number
}

export interface RawIdosellProductImage {
  productImageId?: string
  productImageLargeUrl?: string
  productImageMediumUrl?: string
  productImageSmallUrl?: string
  productImageWidth?: number
  productImageHeight?: number
  productImagePriority?: number
}

export interface RawIdosellProduct {
  productId: number | string
  productDisplayedCode?: string
  categoryId?: number | string
  categoryName?: string
  producerId?: number | string
  producerName?: string
  currencyId?: string
  productRetailPrice?: number
  productVat?: number
  productWeight?: number
  productIsVisible?: string
  productAddingTime?: string
  productModificationTime?: string
  productDescriptionsLangData?: RawIdosellLangEntry[]
  productSizes?: RawIdosellProductSize[]
  productSizesAttributes?: RawIdosellProductSizeAttribute[]
  productImages?: RawIdosellProductImage[]
  productStocksData?: RawIdosellProductStocksData
  [key: string]: unknown
}

function pickLang(
  entries: RawIdosellLangEntry[] | undefined,
  lang?: string,
): RawIdosellLangEntry | undefined {
  if (!entries || entries.length === 0) return undefined
  if (lang) {
    const match = entries.find((e) => e.langId === lang)
    if (match) return match
  }
  return entries[0]
}

function transformImage(raw: RawIdosellProductImage): Image | undefined {
  const url = raw.productImageLargeUrl || raw.productImageMediumUrl || raw.productImageSmallUrl
  if (!url) return undefined
  return {
    id: raw.productImageId,
    url,
    width: raw.productImageWidth,
    height: raw.productImageHeight,
    position: raw.productImagePriority,
  }
}

/**
 * Prefer the per-size price/code table; fall back to the bare size list.
 * A size with no resolvable `sizeId` or price is dropped — both `id` and
 * `price` are required on the canonical `ProductVariant` shape.
 */
function transformVariants(raw: RawIdosellProduct): ProductVariant[] | undefined {
  const productId = String(raw.productId)
  const currency = raw.currencyId?.toUpperCase()
  const rows =
    raw.productSizesAttributes && raw.productSizesAttributes.length > 0
      ? raw.productSizesAttributes
      : raw.productSizes

  if (!rows || rows.length === 0 || !currency) return undefined

  const out: ProductVariant[] = []
  for (const s of rows) {
    if (!s.sizeId) continue
    const priceMajor =
      'productRetailPrice' in s ? (s as RawIdosellProductSizeAttribute).productRetailPrice : undefined
    const resolvedPriceMajor = priceMajor ?? raw.productRetailPrice
    if (resolvedPriceMajor == null) continue
    const attr = s as RawIdosellProductSizeAttribute
    out.push({
      id: `${productId}:${s.sizeId}`,
      productId,
      sku: attr.productSizeCodeExternal || attr.productSizeCodeProducer || undefined,
      title: s.sizePanelName,
      price: { amount: majorToMinor(resolvedPriceMajor, currency), currency },
      optionValues: s.sizePanelName ? { Size: s.sizePanelName } : undefined,
      metadata: s as unknown as Record<string, unknown>,
    })
  }
  return out.length > 0 ? out : undefined
}

export function transformProduct(raw: RawIdosellProduct, lang?: string): Product {
  const langEntry = pickLang(raw.productDescriptionsLangData, lang)
  const images = (raw.productImages ?? [])
    .map(transformImage)
    .filter((i): i is Image => i !== undefined)
  const variants = transformVariants(raw)

  return {
    id: String(raw.productId),
    title: langEntry?.productName || raw.productDisplayedCode || String(raw.productId),
    description: langEntry?.productLongDescription || langEntry?.productDescription || undefined,
    status:
      raw.productIsVisible === 'n' ? 'ARCHIVED' : raw.productIsVisible === 'y' ? 'ACTIVE' : undefined,
    vendor: raw.producerName || undefined,
    variants,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.productAddingTime),
    updatedAt: toIsoDatetime(raw.productModificationTime),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → IdoSell product body for `POST /products/products`
 * (add) / `PUT /products/products` (edit). Only the well-documented,
 * unambiguous fields are mapped — IdoSell's write schema has 100+ optional
 * fields (multi-shop pricing, promotions, WMS…) that have no canonical
 * counterpart and are left to the platform's own defaults.
 */
export function untransformProduct(product: Partial<Product>, lang = 'eng'): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.id) body['productId'] = Number(product.id)
  if (product.title || product.description) {
    body['productDescriptionsLangData'] = [
      {
        langId: lang,
        productName: product.title,
        productLongDescription: product.description,
      },
    ]
  }
  const price = product.variants?.[0]?.price
  if (price) {
    body['productRetailPrice'] = minorToMajor(price.amount, price.currency)
    body['currencyId'] = price.currency
  }
  return body
}
