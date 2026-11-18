/**
 * Falabella product → canonical Product.
 *
 * `GetProducts` (docs: https://developers.falabella.com/docs/products/getproducts)
 * returns, verbatim per the docs' own XML example (Format=JSON converts the
 * same tag names to JSON keys, one `SuccessResponse.Body.Products.Product`
 * per product — a single result is a bare object, not a 1-item array; see
 * `client.ts`'s `toArray`):
 *
 *   <Product><SellerSku>...</SellerSku><ShopSku>...</ShopSku><Name>...</Name>
 *     <ProductId/><MainImage>...</MainImage><Images><Image>...</Image></Images>
 *     <Description>...</Description><Brand>...</Brand>
 *     <PrimaryCategory>Zapatillas deportivas</PrimaryCategory>
 *     <BusinessUnits><BusinessUnit><OperatorCode>facl</OperatorCode>
 *       <Price>64990.00</Price><Stock>14</Stock><Status>active</Status>...
 *     </BusinessUnit></BusinessUnits>...</Product>
 *
 * `SellerSku` is the canonical `Product.id` — it is also the key `GetStock`/
 * `UpdateStock` and order items key on, so it links products to inventory
 * without a separate lookup.
 *
 * Variants are sibling products linked by `ParentSku`, not a first-class
 * parent/variant hierarchy the docs describe a clean mapping for — see
 * `metadata.ts` for why `variant` is declared unavailable. Per-BusinessUnit
 * price/stock therefore has nowhere to live on the canonical `Product`
 * shape (which carries neither); it is intentionally left out of
 * `transformProduct` (see `transform/inventory.ts` for stock).
 *
 * `ProductCreate`/`ProductUpdate` require fields the canonical `Product`
 * schema has no room for (a numeric leaf `PrimaryCategory` id, and a
 * per-BusinessUnit `Price`/`Stock`) — `untransformProduct` requires them via
 * `metadata`, documented on the function itself, rather than inventing
 * values for fields Falabella will otherwise reject the submission over.
 */
import type { Product } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

export interface RawFalabellaImages {
  Image?: string | string[]
}

export interface RawFalabellaProduct {
  SellerSku: string
  Name: string
  Description?: string
  Brand?: string
  PrimaryCategory?: string
  MainImage?: string
  Images?: RawFalabellaImages
}

function collectImages(raw: RawFalabellaProduct): Image[] | undefined {
  const urls: string[] = []
  if (raw.MainImage) urls.push(raw.MainImage)
  const gallery = raw.Images?.Image
  if (Array.isArray(gallery)) urls.push(...gallery)
  else if (typeof gallery === 'string') urls.push(gallery)
  const unique = [...new Set(urls)]
  if (unique.length === 0) return undefined
  return unique.map((url, position) => ({ url, position }))
}

export function transformProduct(raw: RawFalabellaProduct): Product {
  return {
    id: raw.SellerSku,
    title: raw.Name,
    description: raw.Description,
    vendor: raw.Brand,
    productType: raw.PrimaryCategory,
    images: collectImages(raw),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export interface UntransformFalabellaProductInput {
  id: string
  title: string
  description?: string
  /** Falabella leaf category id (numeric) — required, not derivable from the canonical schema. */
  primaryCategoryId: string
  /** Major-unit decimal price for this connection's business unit, e.g. `19990.00`. */
  price: string
  stock: number
  operatorCode: string
}

/** Body for `POST ?Action=ProductCreate` / `ProductUpdate` (raw XML per the docs' own example). */
export function untransformProduct(data: UntransformFalabellaProductInput): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Request><Product>` +
    `<SellerSku>${escapeXml(data.id)}</SellerSku>` +
    `<Name>${escapeXml(data.title)}</Name>` +
    `<PrimaryCategory>${escapeXml(data.primaryCategoryId)}</PrimaryCategory>` +
    (data.description ? `<Description>${escapeXml(data.description)}</Description>` : '') +
    `<BusinessUnits><BusinessUnit>` +
    `<OperatorCode>${escapeXml(data.operatorCode)}</OperatorCode>` +
    `<Price>${escapeXml(data.price)}</Price>` +
    `<Stock>${data.stock}</Stock>` +
    `<Status>active</Status>` +
    `</BusinessUnit></BusinessUnits>` +
    `</Product></Request>`
  )
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
