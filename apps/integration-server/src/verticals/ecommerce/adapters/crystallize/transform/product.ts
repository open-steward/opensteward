/**
 * Crystallize Catalogue Item (product type) -> canonical Product.
 *
 * Crystallize models products as "items" in a shape-driven catalogue tree.
 * Products have "components" (rich content fields) and variants with
 * price variants per market/currency.
 */

import type { Product, ProductOption, ProductStatus } from '../../../schema/product'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { transformVariant, type RawCrystallizeVariant } from './variant'

// ── Raw Crystallize shapes ─────────────────────────────────────────────────

export interface RawCrystallizeImage {
  url?: string
  altText?: string | null
  key?: string
  variants?: Array<{ url?: string; width?: number; height?: number }>
}

export interface RawCrystallizeComponent {
  name?: string
  type?: string
  content?: {
    text?: string
    html?: Array<string> | string
    json?: unknown
    plainText?: string
  } | null
}

export interface RawCrystallizeProduct {
  id: string
  name: string
  cataloguePath?: string | null
  shape?: { identifier?: string; name?: string } | null
  /** draft | published */
  isPublished?: boolean
  components?: RawCrystallizeComponent[]
  variants?: RawCrystallizeVariant[]
  topics?: Array<{ id?: string; name?: string }> | null
  defaultVariant?: RawCrystallizeVariant | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(raw: RawCrystallizeProduct): ProductStatus | undefined {
  if (raw.isPublished === true) return 'ACTIVE'
  if (raw.isPublished === false) return 'DRAFT'
  return undefined
}

function extractDescription(components: RawCrystallizeComponent[] | undefined): string | undefined {
  if (!components) return undefined
  // Look for a component named "description", "body", or "summary"
  const descComp = components.find((c) => {
    const name = (c.name ?? '').toLowerCase()
    return name === 'description' || name === 'body' || name === 'summary'
  })
  if (!descComp?.content) return undefined
  // Prefer HTML, then plainText, then text
  if (descComp.content.html) {
    return Array.isArray(descComp.content.html)
      ? descComp.content.html.join('')
      : descComp.content.html
  }
  return descComp.content.plainText ?? descComp.content.text ?? undefined
}

function mapImages(variants: RawCrystallizeVariant[] | undefined): Image[] | undefined {
  if (!variants) return undefined
  const images: Image[] = []
  const seen = new Set<string>()
  for (const v of variants) {
    for (const img of v.images ?? []) {
      const url = img.url ?? ''
      if (!url || seen.has(url)) continue
      seen.add(url)
      images.push({
        id: img.key ?? undefined,
        url,
        alt: img.altText ?? undefined,
      })
    }
  }
  return images.length > 0 ? images : undefined
}

function mapOptions(variants: RawCrystallizeVariant[] | undefined): ProductOption[] | undefined {
  if (!variants || variants.length === 0) return undefined
  // Extract unique attribute keys across all variants
  const optionMap = new Map<string, Set<string>>()
  for (const v of variants) {
    for (const attr of v.attributes ?? []) {
      if (!attr.attribute) continue
      if (!optionMap.has(attr.attribute)) {
        optionMap.set(attr.attribute, new Set())
      }
      if (attr.value) {
        optionMap.get(attr.attribute)!.add(attr.value)
      }
    }
  }
  if (optionMap.size === 0) return undefined
  const options: ProductOption[] = []
  let pos = 1
  for (const [name, values] of optionMap) {
    options.push({
      name,
      values: [...values],
      position: pos++,
    })
  }
  return options
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawCrystallizeProduct, currency: string = 'USD'): Product {
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, currency))
  const images = mapImages(raw.variants)
  const options = mapOptions(raw.variants)

  const tags = raw.topics
    ?.map((t) => t.name)
    .filter((n): n is string => !!n)

  return {
    id: raw.id,
    title: raw.name,
    description: extractDescription(raw.components),
    handle: toSlug(raw.cataloguePath),
    status: mapStatus(raw),
    productType: raw.shape?.name ?? undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    options,
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  if (product.title != null) input['name'] = product.title
  if (product.handle != null) input['cataloguePath'] = product.handle
  if (product.status != null) input['isPublished'] = product.status === 'ACTIVE'
  return input
}
