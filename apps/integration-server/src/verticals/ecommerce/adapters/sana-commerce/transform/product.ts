/**
 * Sana Commerce product / unit (variant) → canonical Product / ProductVariant.
 *
 * Sana Commerce's web service exposes products via two endpoints:
 *  - GET  `catalog/product/{productId}` — single product with units (variants)
 *  - PUT  `catalog/productsbyloadoptions` — batch list (body: LoadOptions)
 *
 * The API returns a JSON object per product.  Variants are called "units" in
 * Sana terminology and nested under `Units[]` on the product.  Prices are
 * per-unit and expressed as decimal major-unit values (e.g. `19.99`).
 *
 * Docs:
 *  https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/api-methods
 */

import type { Product, ProductVariant, ProductOption, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Sana Commerce shapes ─────────────────────────────────────────────────

export interface RawSanaImage {
  /** Relative or absolute image URL. */
  Url?: string | null
  url?: string | null
  AltText?: string | null
  altText?: string | null
}

export interface RawSanaVariantValue {
  Name?: string | null
  name?: string | null
  Value?: string | null
  value?: string | null
  [key: string]: unknown
}

export interface RawSanaUnit {
  Id?: number | string | null
  id?: number | string | null
  Sku?: string | null
  sku?: string | null
  UnitOfMeasure?: string | null
  unitOfMeasure?: string | null
  Price?: number | null
  price?: number | null
  ListPrice?: number | null
  listPrice?: number | null
  VariantValues?: RawSanaVariantValue[] | null
  variantValues?: RawSanaVariantValue[] | null
  [key: string]: unknown
}

export interface RawSanaProduct {
  Id?: number | string | null
  id?: number | string | null
  ProductId?: string | null
  productId?: string | null
  Title?: string | null
  title?: string | null
  Name?: string | null
  name?: string | null
  Description?: string | null
  description?: string | null
  ProductGroupId?: string | null
  productGroupId?: string | null
  ProductType?: string | null
  productType?: string | null
  IsActive?: boolean | null
  isActive?: boolean | null
  Images?: RawSanaImage[] | null
  images?: RawSanaImage[] | null
  Units?: RawSanaUnit[] | null
  units?: RawSanaUnit[] | null
  Currency?: string | null
  currency?: string | null
  DateCreated?: string | null
  dateCreated?: string | null
  DateModified?: string | null
  dateModified?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function str(v: string | number | null | undefined): string | undefined {
  if (v == null) return undefined
  return String(v).trim() || undefined
}

function mapStatus(active: boolean | null | undefined): ProductStatus | undefined {
  if (active == null) return undefined
  return active ? 'ACTIVE' : 'DRAFT'
}

function mapImage(raw: RawSanaImage): Image | undefined {
  const url = raw.Url ?? raw.url
  if (!url) return undefined
  return {
    url,
    alt: raw.AltText ?? raw.altText ?? undefined,
  }
}

function unitId(unit: RawSanaUnit): string {
  const id = unit.Id ?? unit.id
  return id != null ? String(id) : (unit.Sku ?? unit.sku ?? '')
}

export function transformVariant(unit: RawSanaUnit, productId: string, currency: string): ProductVariant {
  const price = unit.Price ?? unit.price
  const listPrice = unit.ListPrice ?? unit.listPrice

  // Build option values from VariantValues
  const rawVariants = unit.VariantValues ?? unit.variantValues
  let optionValues: Record<string, string> | undefined
  if (rawVariants && rawVariants.length > 0) {
    optionValues = {}
    for (const vv of rawVariants) {
      const name = str(vv.Name ?? vv.name)
      const value = str(vv.Value ?? vv.value)
      if (name && value) optionValues[name] = value
    }
    if (Object.keys(optionValues).length === 0) optionValues = undefined
  }

  return {
    id: unitId(unit),
    productId,
    sku: str(unit.Sku ?? unit.sku),
    title: str(unit.UnitOfMeasure ?? unit.unitOfMeasure),
    price: {
      amount: majorToMinor(price ?? 0, currency),
      currency,
    },
    compareAtPrice:
      listPrice != null && listPrice > 0
        ? { amount: majorToMinor(listPrice, currency), currency }
        : undefined,
    optionValues,
    metadata: unit as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawSanaProduct, defaultCurrency = 'EUR'): Product {
  const id = str(raw.Id ?? raw.id ?? raw.ProductId ?? raw.productId) ?? ''
  const currency = str(raw.Currency ?? raw.currency) ?? defaultCurrency
  const title = str(raw.Title ?? raw.title ?? raw.Name ?? raw.name) ?? ''
  const rawImages = raw.Images ?? raw.images ?? []
  const rawUnits = raw.Units ?? raw.units ?? []

  const images = rawImages.map(mapImage).filter((i): i is Image => i != null)
  const variants = rawUnits.map((u) => transformVariant(u, id, currency))

  // Collect distinct option names for the product-level options array
  const optionNamesSet = new Set<string>()
  const optionValuesMap: Record<string, Set<string>> = {}
  for (const v of variants) {
    if (v.optionValues) {
      for (const [name, value] of Object.entries(v.optionValues)) {
        optionNamesSet.add(name)
        if (!optionValuesMap[name]) optionValuesMap[name] = new Set()
        optionValuesMap[name].add(value)
      }
    }
  }
  const options: ProductOption[] = Array.from(optionNamesSet).map((name) => ({
    name,
    values: Array.from(optionValuesMap[name] ?? []),
  }))

  return {
    id,
    title,
    description: str(raw.Description ?? raw.description),
    status: mapStatus(raw.IsActive ?? raw.isActive),
    productType: str(raw.ProductType ?? raw.productType),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.DateCreated ?? raw.dateCreated),
    updatedAt: toIsoDatetime(raw.DateModified ?? raw.dateModified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
