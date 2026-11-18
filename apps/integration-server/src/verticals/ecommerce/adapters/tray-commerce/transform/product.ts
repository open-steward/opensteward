/**
 * Tray Product / Variant → canonical.
 *
 * Verified with curl against developers.tray.com.br (the WebFetch summarizer
 * had been silently truncating this page — see `client.ts` header). Every
 * field mapped below is copied from a literal example response or a
 * documented field table:
 *
 *   - Product LIST (`#listagem-de-produtos-get`) response example includes:
 *     id, ean, modified, is_kit, slug, ncm, name, price, cost_price,
 *     promotional_price, brand, brand_id, model, weight, stock,
 *     category_id, available, available_in_store, availability, reference,
 *     hot, release, has_variation, url:{http,https}, created, Properties[],
 *     ProductImage[] (shown EMPTY — internal shape never demonstrated),
 *     ProductSettings{...}, Variant[] (shown EMPTY on the product payload,
 *     but the SAME model is fully documented standalone below), AdditionalInfos[].
 *     `description` never appears in a read example anywhere on the page —
 *     it is write-only per the evidence, so it is populated on
 *     `untransformProduct` but NOT read back on `transformProduct`.
 *   - Product CREATE (`#cadastrar-produto-post`) body:
 *     ean, name, ncm, description, description_small, price, cost_price,
 *     promotional_price, start_promotion, end_promotion, ipi_value, brand,
 *     model, weight, length, width, height, stock, category_id, available,
 *     ProductSettings{when_stock_runs_out, order_days_availability},
 *     available_in_store, availability, availability_days, reference, hot,
 *     release, additional_button, related_categories, release_date,
 *     virtual_product. `available_in_store` semantics: Table C in the docs
 *     says 0=shown/1=hidden, which directly contradicts the docs' own
 *     "Regras" prose stated twice ("Só serão exibidos produtos com
 *     available_in_store = 1" / default is 1 = "visível na loja virtual") —
 *     Table C is treated as a documentation typo and the Regras prose as
 *     authoritative (1 = visible), consistent with what every other
 *     platform's "visible in store" flag means.
 *   - Product GET/CREATE/UPDATE/DELETE paths: `GET/POST /products`,
 *     `GET/PUT/DELETE /products/:id`, all `?access_token=`. GET-by-id wraps
 *     the single object as `{"Product": {...}}`.
 *   - Product WRITE body encoding: see `client.ts` header — bracket-path
 *     `application/x-www-form-urlencoded`, not JSON (resolves a genuine
 *     contradiction in the docs' own product-create curl example).
 *   - Variant is a SEPARATE resource at `/products/variants[/:id]`, not
 *     `/variations` (a prior draft guessed that path; it was wrong).
 *     LIST (`#listagem-de-variacoes-get`) and GET
 *     (`#consultar-dados-da-variacao-get`) response examples both show the
 *     `Variant` object with: id, ean, order, product_id, price, cost_price,
 *     stock, minimum_stock, reference, weight, cubic_weight, length, width,
 *     height, start_promotion, end_promotion, promotional_price, available,
 *     quantity_sold, Sku[], VariantImage[], VariationSettings{}. CREATE/PUT
 *     (`#cadastrar-variacao-post` / `#atualizar-dados-da-variacao-put`) body
 *     fields: product_id, ean, order, price, cost_price, stock,
 *     minimum_stock, reference, weight, length, width, height,
 *     start_promotion, end_promotion, promotional_price, Sku[]
 *     {type,value}, quantity_sold. DELETE confirms `/products/variants/:id`;
 *     the PUT example's curl omits `:id` in the URL (every other verb on
 *     this same resource has it) — treated as a documentation typo, not
 *     followed literally, since an id-less PUT could silently target the
 *     wrong record.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw Tray shapes ──────────────────────────────────────────────────────────

export interface RawTrayVariant {
  id: number | string
  product_id?: number | string
  ean?: string
  order?: number | string
  price?: string | number
  cost_price?: string | number
  promotional_price?: string | number | null
  stock?: number | string
  minimum_stock?: number | string
  reference?: string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  available?: number | string | boolean
  [key: string]: unknown
}

export interface RawTrayProduct {
  id: number | string
  name: string
  slug?: string
  ean?: string
  ncm?: string
  price?: string | number
  cost_price?: string | number
  promotional_price?: string | number | null
  brand?: string
  brand_id?: number | string
  model?: string
  weight?: number | string
  stock?: number | string
  category_id?: number | string
  available?: number | string | boolean
  available_in_store?: number | string | boolean
  availability?: string
  reference?: string
  hot?: number | string | boolean
  release?: number | string | boolean
  has_variation?: number | string | boolean
  created?: string
  modified?: string
  Variant?: RawTrayVariant[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined, currency: string): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(Number.isFinite(n) ? n : 0, currency)
}

/** Tray reports `available_in_store` as a boolean/`0`/`1` (docs show both forms across examples). */
function isTruthyFlag(v: number | string | boolean | undefined): boolean | undefined {
  if (v == null) return undefined
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = v.trim().toLowerCase()
  if (s === '') return undefined
  return s === '1' || s === 'true'
}

/** `available_in_store` — see file header for the Table-C-vs-Regras contradiction this resolves. */
function mapStatus(raw: RawTrayProduct): ProductStatus | undefined {
  const truthy = isTruthyFlag(raw.available_in_store)
  if (truthy === undefined) return undefined
  return truthy ? 'ACTIVE' : 'DRAFT'
}

export function transformVariant(
  raw: RawTrayVariant,
  currency: string = DEFAULT_CURRENCY,
): ProductVariant {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.reference ?? undefined,
    barcode: raw.ean ?? undefined,
    price: { amount: toMoneyAmount(raw.price, currency), currency },
    compareAtPrice:
      raw.promotional_price != null && raw.promotional_price !== ''
        ? { amount: toMoneyAmount(raw.promotional_price, currency), currency }
        : undefined,
    weight: raw.weight != null ? Number(raw.weight) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(
  raw: RawTrayProduct,
  currency: string = DEFAULT_CURRENCY,
): Product {
  const variants = (raw.Variant ?? []).map((v) => transformVariant(v, currency))
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw),
    vendor: raw.brand || undefined,
    variants: variants.length > 0 ? variants : undefined,
    // `created`/`modified` are documented (e.g. "2016-10-19 09:30:12") but in
    // a space-separated, no-timezone format canonical `IsoDatetime` rejects,
    // and Tray's docs never state which timezone they're in — guessing one
    // (e.g. assuming UTC) is exactly the class of bug this repo has been
    // burned by before (date-zoning bugs that look identical fixed or
    // broken), so these are left unmapped rather than silently reformatted
    // with a fabricated offset. The raw strings are still in `metadata`.
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Tray product body (bracket-form POST/PUT `/products`, wrapped as `Product` by the caller). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    brand: product.vendor,
  }
  if (product.status !== undefined) {
    // 1 = visible in store — see file header for why this is 1, not Table C's 0.
    body.available = product.status === 'ACTIVE' ? 1 : 0
    body.available_in_store = product.status === 'ACTIVE' ? 1 : 0
  }
  return body
}

/** Canonical ProductVariant → Tray variant body (bracket-form POST/PUT `/products/variants`, wrapped as `Variant`). */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    product_id: variant.productId,
    ean: variant.barcode,
    reference: variant.sku,
  }
  if (variant.price) body.price = minorToMajor(variant.price.amount, variant.price.currency)
  if (variant.compareAtPrice) {
    body.promotional_price = minorToMajor(variant.compareAtPrice.amount, variant.compareAtPrice.currency)
  }
  if (variant.weight != null) body.weight = variant.weight
  return body
}
