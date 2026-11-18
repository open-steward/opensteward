/**
 * Cafe24 Product / Variant → canonical Product / ProductVariant.
 *
 * Cafe24 product field conventions:
 *   - `product_no`   → integer product id
 *   - `product_name` → display name
 *   - `description`  → HTML body
 *   - `product_code` → SKU-like product code used as handle
 *   - `price`        → decimal major-unit in store currency (default KRW)
 *   - `display`      → 'T' = visible, 'F' = hidden
 *   - `selling`      → 'T' = on-sale, 'F' = not for sale
 *   - `created_date` / `updated_date` → ISO-8601 with Korea TZ offset
 *
 * Variants live at `/products/{product_no}/variants` and are embedded on
 * the product when `embed=variants` is passed in the query string.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

export interface RawCafe24VariantOption {
  option_code?: string | null
  option_value?: string | null
  [key: string]: unknown
}

export interface RawCafe24Variant {
  variant_code: string
  options?: RawCafe24VariantOption[]
  price?: string | number | null
  stock?: number | null
  display_soldout?: string | null
  status?: string | null
  [key: string]: unknown
}

export interface RawCafe24OptionValue {
  option_text?: string | null
  [key: string]: unknown
}

export interface RawCafe24Option {
  option_no?: number | string | null
  option_name?: string | null
  option_value?: string[] | RawCafe24OptionValue[] | null
  [key: string]: unknown
}

export interface RawCafe24Product {
  product_no: number | string
  product_name: string
  product_code?: string | null
  description?: string | null
  price?: string | number | null
  display?: string | null
  selling?: string | null
  product_tag?: string | string[] | null
  brand_name?: string | null
  product_type?: string | null
  options?: RawCafe24Option[]
  variants?: RawCafe24Variant[]
  list_image?: string | null
  detail_image?: string | null
  small_image?: string | null
  created_date?: string | null
  updated_date?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(Number.isFinite(n) ? n : 0, currency)
}

/**
 * Map Cafe24 display/selling flags to canonical ProductStatus.
 *   display=F              → ARCHIVED (hidden from storefront)
 *   display=T, selling=F   → DRAFT    (visible but not purchasable)
 *   display=T, selling=T   → ACTIVE
 */
function mapStatus(display?: string | null, selling?: string | null): ProductStatus | undefined {
  if (display == null && selling == null) return undefined
  if (display === 'F') return 'ARCHIVED'
  if (selling === 'F') return 'DRAFT'
  if (display === 'T' && selling === 'T') return 'ACTIVE'
  return undefined
}

function parseTags(raw: string | string[] | null | undefined): string[] | undefined {
  if (!raw) return undefined
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string' && t.length > 0)
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function mapOption(raw: RawCafe24Option): ProductOption {
  let values: string[] = []
  if (Array.isArray(raw.option_value)) {
    values = raw.option_value
      .map((v) => {
        if (typeof v === 'string') return v
        return String((v as RawCafe24OptionValue).option_text ?? '')
      })
      .filter(Boolean)
  }
  return {
    id: raw.option_no != null ? String(raw.option_no) : undefined,
    name: raw.option_name ?? '',
    values,
  }
}

function mapImages(raw: RawCafe24Product): Image[] {
  const images: Image[] = []
  const seen = new Set<string>()
  const tryAdd = (url: string | null | undefined, pos: number) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    images.push({ url, position: pos })
  }
  tryAdd(raw.detail_image, 0)
  tryAdd(raw.list_image, 1)
  tryAdd(raw.small_image, 2)
  return images
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawCafe24Variant,
  productNo: string,
  currency: string = 'KRW',
): ProductVariant {
  const optionValues: Record<string, string> = {}
  if (Array.isArray(raw.options)) {
    for (const opt of raw.options) {
      if (opt.option_code && opt.option_value) {
        optionValues[opt.option_code] = opt.option_value
      }
    }
  }

  return {
    id: `${productNo}:${raw.variant_code}`,
    productId: productNo,
    price: {
      amount: toMoneyAmount(raw.price, currency),
      currency,
    },
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawCafe24Product, currency: string = 'KRW'): Product {
  const productId = String(raw.product_no)
  const options = (raw.options ?? []).map(mapOption)
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, productId, currency))
  const images = mapImages(raw)

  return {
    id: productId,
    title: raw.product_name,
    description: raw.description ?? undefined,
    handle: raw.product_code ?? undefined,
    status: mapStatus(raw.display, raw.selling),
    vendor: raw.brand_name ?? undefined,
    productType: raw.product_type ?? undefined,
    tags: parseTags(raw.product_tag),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created_date),
    updatedAt: toIsoDatetime(raw.updated_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Cafe24 product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title != null) body.product_name = product.title
  if (product.description != null) body.description = product.description
  if (product.vendor != null) body.brand_name = product.vendor
  if (product.productType != null) body.product_type = product.productType
  if (product.tags != null) body.product_tag = product.tags.join(',')
  if (product.status != null) {
    switch (product.status) {
      case 'ACTIVE':
        body.display = 'T'
        body.selling = 'T'
        break
      case 'DRAFT':
        body.display = 'T'
        body.selling = 'F'
        break
      case 'ARCHIVED':
        body.display = 'F'
        body.selling = 'F'
        break
    }
  }
  return body
}
