/**
 * Yo!Kart Product → canonical Product / ProductVariant.
 *
 * Yo!Kart surfaces products through two endpoints:
 *  - `/products/search` — paginated listing; each item has `product_id`,
 *    `product_name`, `selprod_id` (seller-product listing id), price fields
 *    as currency-prefixed strings, and a single image URL.
 *  - `/products/view/{id}` — single product detail; includes description,
 *    options (color, size via `option_id` / `optionValues` array), and stock.
 *
 * Key field mapping:
 *  - `product_id`         → canonical product id
 *  - `selprod_id`         → canonical variant id (seller-product)
 *  - `theprice`           → effective/sale price (e.g. "€14.55")
 *  - `selprod_price`      → original / compare-at price (e.g. "€18.77")
 *  - `special_price_found` "1" → discount is active
 *  - `product_name`       → title
 *  - `in_stock` "1"       → ACTIVE; "0" → ARCHIVED
 *  - `brand_name`         → vendor
 *  - `prodcat_name`       → productType
 *
 * Prices are formatted strings with a leading currency symbol (e.g. "€18.77",
 * "$14.55"). We strip the symbol, parse the float, then convert to minor units
 * using `majorToMinor`.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartProductImage {
  afile_id?: number | string
  afile_name?: string
  product_image_url?: string
}

export interface RawYokartOptionValue {
  optionvalue_id?: number | string
  optionvalue_name?: string
  optionvalue_color_code?: string
}

export interface RawYokartOption {
  option_id?: number | string
  option_name?: string
  optionValues?: RawYokartOptionValue[]
}

/**
 * Shape returned by both `/products/search` (list) and
 * `/products/view/{id}` (detail). Detail responses include additional
 * fields (`product_description`, `options`, `images`).
 */
export interface RawYokartProduct {
  product_id: number | string
  product_name: string
  product_identifier?: string
  /** SKU / model number. */
  product_model?: string
  product_type?: string | number
  product_description?: string
  product_short_description?: string
  /**
   * Effective (possibly discounted) selling price with currency symbol,
   * e.g. "€14.55".
   */
  theprice?: string | null
  /**
   * Original / list price with currency symbol, e.g. "€18.77". When a
   * discount is active (`special_price_found == "1"`), this is the
   * compare-at price shown crossed out.
   */
  selprod_price?: string | null
  /** "1" when `theprice` < `selprod_price` (discount is active). */
  special_price_found?: string | number
  /** Seller-product listing id — the canonical variant id. */
  selprod_id?: number | string
  selprod_user_id?: number | string
  /** Seller-product subtitle / variant title. */
  selprod_title?: string
  selprod_stock?: string | number | null
  selprod_min_order_qty?: string | number
  /** "1" = new, "2" = used. */
  selprod_condition?: string | number
  /** "1" = in stock, "0" = out of stock. */
  in_stock?: string | number
  prodcat_id?: number | string
  prodcat_name?: string
  brand_id?: number | string
  brand_name?: string
  shop_id?: number | string
  shop_name?: string
  prod_rating?: string | number
  totReviews?: string | number
  /** Thumbnail image URL (listing response). */
  product_image_url?: string
  /** Full image array (detail response from /products/view). */
  images?: RawYokartProductImage[]
  /** Options / variants (detail response from /products/view). */
  options?: RawYokartOption[]
  product_warranty?: string | number
  product_warranty_unit?: string | number
  /** Human-readable discount label, e.g. "22.48% OFF". */
  discount?: string
  [key: string]: unknown
}

// ── Price parsing ─────────────────────────────────────────────────────────────

/**
 * Strip leading currency symbol/code and parse the resulting float.
 * Yo!Kart formats prices as "€18.77", "$14.55", "18.77", etc.
 */
function parsePriceStr(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined
  const cleaned = raw.replace(/^[^0-9\-.]+/, '').trim()
  const n = parseFloat(cleaned)
  return Number.isNaN(n) ? undefined : n
}

function toMinor(raw: string | null | undefined, currency: string = 'USD'): number {
  const n = parsePriceStr(raw)
  if (n == null) return 0
  return majorToMinor(n, currency)
}

/**
 * Infer the ISO-4217 currency code from the leading symbol in a price
 * string. Falls back to 'USD' for unknown symbols.
 */
function inferCurrency(priceStr: string | null | undefined): string {
  if (!priceStr) return 'USD'
  const sym = priceStr.replace(/[\d.,\s-]+/g, '').trim()
  const MAP: Record<string, string> = {
    '€': 'EUR',
    '$': 'USD',
    '£': 'GBP',
    '₹': 'INR',
    '¥': 'JPY',
    '₩': 'KRW',
    'R$': 'BRL',
    'CA$': 'CAD',
    'AU$': 'AUD',
  }
  return MAP[sym] ?? 'USD'
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(inStock: string | number | undefined): ProductStatus | undefined {
  if (inStock == null) return undefined
  return String(inStock) === '1' ? 'ACTIVE' : 'ARCHIVED'
}

// ── Image transform ───────────────────────────────────────────────────────────

function transformImage(raw: RawYokartProductImage, index: number): Image | undefined {
  const url = raw.product_image_url
  if (!url) return undefined
  return {
    id: raw.afile_id != null ? String(raw.afile_id) : undefined,
    url,
    position: index,
  }
}

// ── Option transform ──────────────────────────────────────────────────────────

function transformOption(raw: RawYokartOption): ProductOption | undefined {
  if (!raw.option_name) return undefined
  const values = (raw.optionValues ?? [])
    .map((v) => v.optionvalue_name)
    .filter((v): v is string => v != null && v !== '')
  return {
    id: raw.option_id != null ? String(raw.option_id) : undefined,
    name: raw.option_name,
    values,
  }
}

// ── Product transform ─────────────────────────────────────────────────────────

export function transformProduct(raw: RawYokartProduct): Product {
  const productId = String(raw.product_id)
  const currency = inferCurrency(raw.theprice ?? raw.selprod_price)

  // Images: prefer the full image array (detail response); fall back to the
  // single thumbnail URL present in listing responses.
  const images: Image[] = []
  if (raw.images && raw.images.length > 0) {
    for (let i = 0; i < raw.images.length; i++) {
      const img = transformImage(raw.images[i]!, i)
      if (img) images.push(img)
    }
  } else if (raw.product_image_url) {
    images.push({ url: raw.product_image_url, position: 0 })
  }

  // Options (present in detail responses only).
  const options: ProductOption[] = []
  if (raw.options && raw.options.length > 0) {
    for (const opt of raw.options) {
      const canonical = transformOption(opt)
      if (canonical) options.push(canonical)
    }
  }

  // Yo!Kart's seller-product id is the closest analogue to a SKU/variant.
  const selprodId =
    raw.selprod_id != null ? String(raw.selprod_id) : `${productId}:default`
  const effectivePrice = toMinor(raw.theprice, currency)
  const listPrice = toMinor(raw.selprod_price, currency)
  const hasDiscount =
    String(raw.special_price_found) === '1' && listPrice > effectivePrice

  const variant: ProductVariant = {
    id: selprodId,
    productId,
    sku: raw.product_model || undefined,
    title: raw.selprod_title || undefined,
    price: { amount: effectivePrice, currency },
    compareAtPrice: hasDiscount ? { amount: listPrice, currency } : undefined,
    inventoryItemId: selprodId,
    metadata: {
      selprod_id: raw.selprod_id,
      selprod_stock: raw.selprod_stock,
      shop_id: raw.shop_id,
      shop_name: raw.shop_name,
    },
  }

  return {
    id: productId,
    title: raw.product_name,
    description: raw.product_description,
    status: mapStatus(raw.in_stock),
    vendor: raw.brand_name || undefined,
    productType: raw.prodcat_name || undefined,
    options: options.length > 0 ? options : undefined,
    variants: [variant],
    images: images.length > 0 ? images : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Variant transform ─────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawYokartProduct,
  productId?: string,
): ProductVariant {
  const pid = productId ?? String(raw.product_id)
  const selprodId =
    raw.selprod_id != null ? String(raw.selprod_id) : `${pid}:default`
  const currency = inferCurrency(raw.theprice ?? raw.selprod_price)
  const effectivePrice = toMinor(raw.theprice, currency)
  const listPrice = toMinor(raw.selprod_price, currency)
  const hasDiscount =
    String(raw.special_price_found) === '1' && listPrice > effectivePrice

  return {
    id: selprodId,
    productId: pid,
    sku: raw.product_model || undefined,
    title: raw.selprod_title || undefined,
    price: { amount: effectivePrice, currency },
    compareAtPrice: hasDiscount ? { amount: listPrice, currency } : undefined,
    inventoryItemId: selprodId,
    metadata: raw as Record<string, unknown>,
  }
}
