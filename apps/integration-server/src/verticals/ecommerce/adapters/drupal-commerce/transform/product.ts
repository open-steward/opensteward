/**
 * Drupal Commerce Product → canonical Product.
 *
 * Drupal Commerce exposes products as `commerce_product--default` and
 * variations (SKUs) as `commerce_product_variation--default` via JSON:API.
 *
 * A product (`commerce_product--default`) has:
 *   - `attributes.title`          — product display name
 *   - `attributes.status`         — boolean (1 = active, 0 = inactive)
 *   - `attributes.body.value`     — HTML description
 *   - `attributes.created`        — Unix timestamp (seconds)
 *   - `attributes.changed`        — Unix timestamp (seconds)
 *   - `relationships.variations`  — list of variation UUIDs
 *
 * A variation (`commerce_product_variation--default`) has:
 *   - `attributes.title`
 *   - `attributes.sku`
 *   - `attributes.price.number`   — price as string (e.g. "29.99")
 *   - `attributes.price.currency_code`
 *   - `attributes.status`         — boolean
 *   - `relationships.product_id`  — back-link to parent product
 *
 * JSON:API resources are NOT pre-flattened — this adapter works with the
 * raw `{type, id, attributes, relationships}` shape directly.
 */

import type { Product, ProductVariant } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'
import type { JsonApiResource } from '../client'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalProductAttributes {
  title?: string
  status?: boolean | number
  body?: { value?: string; format?: string } | null
  created?: number | string
  changed?: number | string
  field_price?: { number?: string; currency_code?: string } | null
  [key: string]: unknown
}

export interface DrupalVariationAttributes {
  title?: string
  sku?: string
  status?: boolean | number
  price?: { number?: string; currency_code?: string } | null
  list_price?: { number?: string; currency_code?: string } | null
  created?: number | string
  changed?: number | string
  field_images?: Array<{ url?: string }> | null
  [key: string]: unknown
}

export type DrupalProduct = JsonApiResource & {
  attributes: DrupalProductAttributes
}

export type DrupalVariation = JsonApiResource & {
  attributes: DrupalVariationAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToIso(ts: number | string | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000).toISOString()
}

function parsePrice(
  priceField: { number?: string; currency_code?: string } | null | undefined,
): { amount: number; currency: string } {
  const major = parseFloat(priceField?.number ?? '0') || 0
  const currency = priceField?.currency_code ?? 'USD'
  return { amount: majorToMinor(major, currency), currency }
}

function isActive(status: boolean | number | undefined): boolean {
  if (status == null) return true
  if (typeof status === 'boolean') return status
  return status !== 0
}

function relationshipIds(
  resource: JsonApiResource,
  field: string,
): string[] {
  const rel = resource.relationships?.[field]
  if (!rel) return []
  if (Array.isArray(rel.data)) return rel.data.map((d) => d.id)
  if (rel.data && !Array.isArray(rel.data)) return [rel.data.id]
  return []
}

function relationshipId(resource: JsonApiResource, field: string): string | undefined {
  const rel = resource.relationships?.[field]
  if (!rel || !rel.data || Array.isArray(rel.data)) return undefined
  return rel.data.id
}

// ── Variation transform ───────────────────────────────────────────────────────

export function transformVariant(raw: DrupalVariation): ProductVariant {
  const attrs = raw.attributes
  const price = parsePrice(attrs.price)
  const compareAtPrice = attrs.list_price ? parsePrice(attrs.list_price) : undefined

  return {
    id: raw.id,
    productId: relationshipId(raw, 'product_id'),
    sku: attrs.sku,
    title: attrs.title,
    price,
    compareAtPrice,
    requiresShipping: true,
    taxable: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Product transform ─────────────────────────────────────────────────────────

export function transformProduct(
  raw: DrupalProduct,
  includedVariations?: DrupalVariation[],
): Product {
  const attrs = raw.attributes
  const active = isActive(attrs.status)
  const variationIds = relationshipIds(raw, 'variations')

  const variants: ProductVariant[] | undefined =
    includedVariations && includedVariations.length > 0
      ? includedVariations.map(transformVariant)
      : variationIds.length > 0
        ? variationIds.map((vid) => ({
            id: vid,
            productId: raw.id,
            price: { amount: 0, currency: 'USD' },
            metadata: { synthetic: true, reason: 'variation not included in response' },
          }))
        : undefined

  return {
    id: raw.id,
    title: attrs.title ?? '',
    description: attrs.body?.value ?? undefined,
    status: active ? 'ACTIVE' : 'DRAFT',
    variants,
    createdAt: unixToIso(attrs.created),
    updatedAt: unixToIso(attrs.changed),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const active = product.status == null ? undefined : product.status === 'ACTIVE'
  return {
    data: {
      type: 'commerce_product--default',
      attributes: {
        ...(product.title != null ? { title: product.title } : {}),
        ...(active != null ? { status: active } : {}),
        ...(product.description != null ? { body: { value: product.description, format: 'basic_html' } } : {}),
      },
    },
  }
}

export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    data: {
      type: 'commerce_product_variation--default',
      attributes: {
        ...(variant.sku != null ? { sku: variant.sku } : {}),
        ...(variant.title != null ? { title: variant.title } : {}),
        ...(variant.price != null
          ? { price: { number: String(variant.price.amount), currency_code: variant.price.currency } }
          : {}),
      },
    },
  }
}
