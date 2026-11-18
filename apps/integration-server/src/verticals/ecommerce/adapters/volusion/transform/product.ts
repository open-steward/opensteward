/**
 * Volusion Product → canonical Product / ProductVariant.
 *
 * Volusion products have limited variant support. Each product may have
 * "options" (e.g. Size, Color) but variants are modelled as option
 * combinations with separate SKUs rather than first-class variant records.
 * We flatten them into the canonical shape.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Volusion shapes ─────────────────────────────────────────────────────

export interface RawVolusionImage {
  ImageID?: number | string
  PathToImage?: string
  ImageAltText?: string | null
  SortOrder?: number
}

export interface RawVolusionOption {
  OptionID?: number | string
  OptionName?: string
  OptionSortOrder?: number
  OptionValues?: string[]
}

export interface RawVolusionVariant {
  VariantID?: number | string
  ProductCode?: string
  VariantPrice?: number | string | null
  VariantSalePrice?: number | string | null
  VariantWeight?: number | null
  StockQuantity?: number | null
  OptionValues?: Record<string, string>
}

export interface RawVolusionProduct {
  ProductID: number | string
  ProductCode?: string
  ProductName: string
  ProductDescription?: string | null
  SEFriendlyName?: string | null
  IsActive?: boolean
  Manufacturer?: string | null
  ProductCategory?: string | null
  SalePrice?: number | string | null
  ProductPrice?: number | string | null
  FreeShippingItem?: boolean
  ProductWeight?: number | null
  WeightUnit?: string | null
  TaxableProduct?: boolean
  Options?: RawVolusionOption[]
  Variants?: RawVolusionVariant[]
  Images?: RawVolusionImage[]
  DateCreated?: string | null
  LastModified?: string | null
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined, currency: string = 'USD'): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isNaN(n) ? 0 : majorToMinor(n, currency)
}

function mapStatus(isActive: boolean | undefined): ProductStatus | undefined {
  if (isActive == null) return undefined
  return isActive ? 'ACTIVE' : 'DRAFT'
}

function mapWeightUnit(u: string | null | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  if (lower === 'lbs') return 'lb'
  return undefined
}

function transformImage(raw: RawVolusionImage): Image {
  return {
    id: raw.ImageID != null ? String(raw.ImageID) : undefined,
    url: raw.PathToImage ?? '',
    alt: raw.ImageAltText ?? undefined,
    position: raw.SortOrder,
  }
}

function transformOption(raw: RawVolusionOption): ProductOption {
  return {
    id: raw.OptionID != null ? String(raw.OptionID) : undefined,
    name: raw.OptionName ?? '',
    values: raw.OptionValues ?? [],
    position: raw.OptionSortOrder,
  }
}

export function transformVariant(
  raw: RawVolusionVariant,
  currency: string = 'USD',
): ProductVariant {
  const salePrice = raw.VariantSalePrice
  return {
    id: raw.VariantID != null ? String(raw.VariantID) : '',
    sku: raw.ProductCode || undefined,
    title: raw.ProductCode || undefined,
    price: { amount: toNum(raw.VariantPrice, currency), currency },
    compareAtPrice:
      salePrice != null && salePrice !== ''
        ? { amount: toNum(salePrice, currency), currency }
        : undefined,
    weight: raw.VariantWeight ?? undefined,
    optionValues: raw.OptionValues,
    taxable: undefined,
    requiresShipping: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(
  raw: RawVolusionProduct,
  currency: string = 'USD',
): Product {
  const variants = (raw.Variants ?? []).map((v) => transformVariant(v, currency))
  const images = (raw.Images ?? []).map(transformImage)
  const options = (raw.Options ?? []).map(transformOption)

  // If no explicit variants, create one from the product itself
  if (variants.length === 0) {
    variants.push({
      id: String(raw.ProductID),
      sku: raw.ProductCode || undefined,
      title: raw.ProductName,
      price: { amount: toNum(raw.ProductPrice, currency), currency },
      compareAtPrice:
        raw.SalePrice != null && raw.SalePrice !== ''
          ? { amount: toNum(raw.SalePrice, currency), currency }
          : undefined,
      weight: raw.ProductWeight ?? undefined,
      weightUnit: mapWeightUnit(raw.WeightUnit),
      taxable: raw.TaxableProduct,
      requiresShipping: raw.FreeShippingItem != null ? !raw.FreeShippingItem : undefined,
      metadata: raw as unknown as Record<string, unknown>,
    })
  }

  return {
    id: String(raw.ProductID),
    title: raw.ProductName,
    description: raw.ProductDescription ?? undefined,
    handle: raw.SEFriendlyName ?? undefined,
    status: mapStatus(raw.IsActive),
    vendor: raw.Manufacturer ?? undefined,
    productType: raw.ProductCategory ?? undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.DateCreated ?? undefined,
    updatedAt: raw.LastModified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Volusion product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ProductName: product.title,
    ProductDescription: product.description,
    SEFriendlyName: product.handle,
    Manufacturer: product.vendor,
    ProductCategory: product.productType,
    IsActive: product.status ? product.status === 'ACTIVE' : undefined,
  }
  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    body.ProductCode = v.sku
    body.ProductPrice = v.price?.amount
    body.SalePrice = v.compareAtPrice?.amount
    body.ProductWeight = v.weight
    body.TaxableProduct = v.taxable
  }
  if (product.images) {
    body.Images = product.images.map((i) => ({
      PathToImage: i.url,
      ImageAltText: i.alt,
      SortOrder: i.position,
    }))
  }
  return body
}

/** Canonical ProductVariant → Volusion variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    ProductCode: variant.sku,
    VariantPrice: variant.price?.amount,
    VariantSalePrice: variant.compareAtPrice?.amount,
    VariantWeight: variant.weight,
    OptionValues: variant.optionValues,
  }
}
