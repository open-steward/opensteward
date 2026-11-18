/**
 * Znode Product → canonical Product.
 *
 * Znode products use a configurable-product model where a parent product
 * can have child "associated products" (variants). Products without
 * children get a synthetic default variant.
 *
 * Canonical `Product.id` = Znode product id (ZnodeProductId, numeric, stringified).
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import { toIsoDatetime } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Znode shapes ─────────────────────────────────────────────────────────

export interface RawZnodeProduct {
  ZnodeProductId?: number
  SKU?: string
  Name?: string
  IsActive?: boolean
  ProductType?: number // 1 = Simple, 2 = Configurable, 3 = Bundle, 4 = Grouped
  Description?: string
  ShortDescription?: string
  SEOUrl?: string
  CreatedDate?: string
  ModifiedDate?: string
  RetailPrice?: number
  SalesPrice?: number
  CurrencyCode?: string
  Weight?: number
  WeightUnit?: string
  Images?: RawZnodeProductImage[]
  Attributes?: RawZnodeAttribute[]
  AssociatedProducts?: RawZnodeProduct[]
  CategoryIds?: number[]
  Inventory?: { Quantity?: number; WarehouseId?: number }
  [key: string]: unknown
}

export interface RawZnodeProductImage {
  MediaId?: number
  MediaPath?: string
  DisplayOrder?: number
  AlternateText?: string
  [key: string]: unknown
}

export interface RawZnodeAttribute {
  AttributeCode?: string
  AttributeName?: string
  AttributeValues?: string[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(isActive: boolean | undefined): ProductStatus | undefined {
  if (isActive === undefined) return undefined
  return isActive ? 'ACTIVE' : 'ARCHIVED'
}

function mapImages(raw: RawZnodeProduct): Image[] {
  const imgs = raw.Images ?? []
  return imgs
    .filter((img) => img.MediaPath)
    .map((img, idx) => ({
      id: img.MediaId != null ? String(img.MediaId) : undefined,
      url: img.MediaPath!,
      alt: img.AlternateText,
      position: img.DisplayOrder ?? idx,
    }))
}

function extractPrice(raw: RawZnodeProduct): { amount: number; currency: string } {
  const currency = raw.CurrencyCode ?? 'USD'
  return {
    amount: majorToMinor(raw.SalesPrice ?? raw.RetailPrice ?? 0, currency),
    currency,
  }
}

function buildOptions(raw: RawZnodeProduct): ProductOption[] | undefined {
  const attrs = raw.Attributes
  if (!attrs || !Array.isArray(attrs)) return undefined
  const options: ProductOption[] = []
  let pos = 0
  for (const attr of attrs) {
    if (attr.AttributeValues && attr.AttributeValues.length > 0) {
      options.push({
        name: attr.AttributeName ?? attr.AttributeCode ?? `option_${pos}`,
        values: attr.AttributeValues,
        position: pos++,
      })
    }
  }
  return options.length > 0 ? options : undefined
}

function productTypeString(typeNum: number | undefined): string | undefined {
  switch (typeNum) {
    case 1: return 'simple'
    case 2: return 'configurable'
    case 3: return 'bundle'
    case 4: return 'grouped'
    default: return 'unknown'
  }
}

// ── Variant transform ─────────────────────────────────────────────────────────

export function transformProductVariant(
  child: RawZnodeProduct,
  parentId: string,
): ProductVariant {
  const { amount, currency } = extractPrice(child)
  return {
    id: String(child.ZnodeProductId ?? ''),
    productId: parentId,
    sku: child.SKU,
    title: child.Name,
    price: { amount, currency },
    weight: child.Weight,
    taxable: true,
    requiresShipping: true,
    metadata: {
      ...(child as Record<string, unknown>),
      parentProductId: parentId,
    },
  }
}

// ── Product transform ─────────────────────────────────────────────────────────

export function transformProduct(
  raw: RawZnodeProduct,
  children?: RawZnodeProduct[],
): Product {
  const images = mapImages(raw)
  const { amount, currency } = extractPrice(raw)
  const id = String(raw.ZnodeProductId ?? '')

  let variants: ProductVariant[] = []
  if (children && children.length > 0) {
    variants = children.map((c) => transformProductVariant(c, id))
  } else if (raw.AssociatedProducts && raw.AssociatedProducts.length > 0) {
    variants = raw.AssociatedProducts.map((c) => transformProductVariant(c, id))
  } else if (raw.ProductType !== 2) {
    // Synthesize a default variant for simple products
    variants = [
      {
        id: `${id}:default`,
        productId: id,
        sku: raw.SKU,
        title: raw.Name,
        price: { amount, currency },
        weight: raw.Weight,
        taxable: true,
        requiresShipping: true,
        metadata: {
          synthetic: true,
          reason: `Znode ${productTypeString(raw.ProductType) ?? 'simple'} product has no separate variants`,
          parentProductId: id,
        },
      },
    ]
  }

  return {
    id,
    title: raw.Name ?? '',
    description: raw.Description,
    handle: raw.SEOUrl,
    status: mapStatus(raw.IsActive),
    productType: productTypeString(raw.ProductType),
    options: buildOptions(raw),
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.CreatedDate),
    updatedAt: toIsoDatetime(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ─────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const first = product.variants?.[0]
  return {
    SKU: product.id ?? first?.sku,
    Name: product.title,
    IsActive: product.status === 'ACTIVE' ? true : product.status === 'ARCHIVED' ? false : true,
    Description: product.description,
    SalesPrice: first?.price?.amount != null ? first.price.amount / 100 : undefined,
    CurrencyCode: first?.price?.currency,
  }
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    SKU: variant.sku,
    Name: variant.title,
    IsActive: true,
    SalesPrice: variant.price?.amount != null ? variant.price.amount / 100 : undefined,
    CurrencyCode: variant.price?.currency,
  }
}
