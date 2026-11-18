/**
 * Fluent Commerce product transform.
 *
 * Fluent models products as VariantProduct (a concrete SKU) under a Product group.
 * Fields surfaced by the GraphQL `variantProducts` query:
 *   ref, name, gtin, summary, type, status, createdOn, updatedOn,
 *   prices (list of { type, value, currency }),
 *   attributes (list of { name, value }),
 *   catalogue { ref }
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawFluentCommerceProduct {
  ref: string
  name?: string
  gtin?: string
  summary?: string
  type?: string
  status?: string
  createdOn?: string
  updatedOn?: string
  prices?: Array<{
    type?: string
    value?: number
    currency?: string
  }>
  attributes?: Array<{
    name: string
    value?: unknown
  }>
  catalogue?: { ref?: string }
  [key: string]: unknown
}

function findAttribute(attrs: Array<{ name: string; value?: unknown }>, name: string): unknown {
  return attrs.find((a) => a.name === name)?.value
}

export function transformProduct(raw: RawFluentCommerceProduct): Product {
  const attrs = raw.attributes ?? []

  // Look for a RETAIL or DEFAULT price entry
  const retailPriceEntry = raw.prices?.find((p) =>
    p.type === 'RETAIL' || p.type === 'DEFAULT' || p.type === 'BASE',
  ) ?? raw.prices?.[0]

  const brand = findAttribute(attrs, 'brand') ?? findAttribute(attrs, 'Brand')
  const category = findAttribute(attrs, 'category') ?? findAttribute(attrs, 'Category')
  const isActiveRaw = findAttribute(attrs, 'isActive') ?? findAttribute(attrs, 'active')

  return {
    id: raw.ref,
    externalId: raw.ref,
    sku: pickStr(raw.ref) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.summary),
    upc: pickStr(raw.gtin),
    brand: brand != null ? String(brand) : undefined,
    category: category != null ? String(category) : undefined,
    unitOfMeasure: 'each',
    retailPrice: retailPriceEntry?.value != null
      ? {
          // Fluent stores prices as decimal; convert to integer minor units.
          amount: Math.round(retailPriceEntry.value * 100),
          currency: retailPriceEntry.currency ?? 'USD',
        }
      : undefined,
    isActive: isActiveRaw != null ? pickBool(isActiveRaw) ?? true : (raw.status !== 'INACTIVE'),
    supplierIds: [],
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.updatedOn),
    platform: 'fluent-commerce',
    metadata: strMap({
      type: raw.type,
      status: raw.status,
      catalogueRef: raw.catalogue?.ref,
    }),
    raw,
  }
}
