/**
 * Wix Product → canonical Product / ProductVariant.
 *
 * Wix products have `variants[]` and `productOptions[]` inline. Product status
 * uses `"VISIBLE"` → ACTIVE, `"HIDDEN"` → ARCHIVED — there is no draft status.
 * Money is `{ value: "19.99", currency: "USD" }` (string amounts).
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Wix shapes ──────────────────────────────────────────────────────────

export interface RawWixMoney {
  value?: string
  currency?: string
}

export interface RawWixMedia {
  id?: string
  url?: string
  fullUrl?: string
  altText?: string | null
  width?: number
  height?: number
}

export interface RawWixProductOption {
  name?: string
  optionType?: string
  choices?: Array<{ value?: string; description?: string }>
}

export interface RawWixVariant {
  id?: string
  choices?: Record<string, string>
  variant?: {
    priceData?: {
      price?: number | string
      discountedPrice?: number | string
      currency?: string
    }
    sku?: string
    weight?: number
    visible?: boolean
  }
  stock?: {
    trackInventory?: boolean
    quantity?: number
    inStock?: boolean
  }
}

export interface RawWixProduct {
  id?: string
  name?: string
  description?: string
  slug?: string
  visible?: boolean
  productType?: string
  media?: {
    items?: RawWixMedia[]
    mainMedia?: RawWixMedia
  }
  productOptions?: RawWixProductOption[]
  variants?: RawWixVariant[]
  priceData?: {
    price?: number | string
    currency?: string
  }
  stock?: {
    trackInventory?: boolean
    quantity?: number
    inStock?: boolean
    inventoryStatus?: string
  }
  ribbon?: string
  brand?: string
  numericId?: string
  createdDate?: string
  lastUpdated?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined, currency?: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) || 0 : v
  return majorToMinor(n, currency)
}

function mapStatus(visible: boolean | undefined): ProductStatus | undefined {
  if (visible === true) return 'ACTIVE'
  if (visible === false) return 'ARCHIVED'
  return undefined
}

function mapStatusToVisible(status: ProductStatus | undefined): boolean | undefined {
  if (status === 'ACTIVE') return true
  if (status === 'ARCHIVED' || status === 'DRAFT') return false
  return undefined
}

function transformImage(raw: RawWixMedia): Image {
  return {
    id: raw.id,
    url: raw.fullUrl ?? raw.url ?? '',
    alt: raw.altText ?? undefined,
    width: raw.width,
    height: raw.height,
  }
}

function transformOption(raw: RawWixProductOption): ProductOption {
  return {
    name: raw.name ?? '',
    values: (raw.choices ?? []).map((c) => c.value ?? c.description ?? ''),
  }
}

export function transformVariant(
  raw: RawWixVariant,
  currency: string = 'USD',
  productId?: string,
): ProductVariant {
  const v = raw.variant
  const cur = v?.priceData?.currency ?? currency
  const price = toMoneyAmount(v?.priceData?.price, cur)

  return {
    id: raw.id ?? '',
    productId,
    sku: v?.sku || undefined,
    title: raw.choices
      ? Object.values(raw.choices).join(' / ')
      : undefined,
    price: { amount: price, currency: cur },
    compareAtPrice: undefined,
    weight: v?.weight,
    optionValues: raw.choices && Object.keys(raw.choices).length > 0
      ? raw.choices
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawWixProduct): Product {
  const currency = raw.priceData?.currency ?? 'USD'
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, currency, raw.id),
  )
  const images = (raw.media?.items ?? []).map(transformImage)
  const options = (raw.productOptions ?? []).map(transformOption)

  return {
    id: raw.id ?? '',
    title: raw.name ?? '',
    description: raw.description || undefined,
    handle: raw.slug,
    status: mapStatus(raw.visible),
    vendor: raw.brand || undefined,
    productType: raw.productType || undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.createdDate,
    updatedAt: raw.lastUpdated,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Wix product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    visible: mapStatusToVisible(product.status),
    brand: product.vendor,
    productType: product.productType,
  }
  if (product.images) {
    body.media = {
      items: product.images.map((i) => ({
        id: i.id,
        fullUrl: i.url,
        altText: i.alt,
      })),
    }
  }
  return body
}
