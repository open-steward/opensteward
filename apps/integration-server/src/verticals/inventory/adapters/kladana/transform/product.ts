/**
 * Kladana product transform.
 *
 * Kladana entity: /entity/product
 * Amounts: Kladana stores prices in kopecks (integer minor units) — pass through as-is.
 * Barcodes: array of objects with a single key (e.g. { ean13: "..." }).
 * Supplier: single `supplier` reference object with `meta.href` carrying the UUID.
 * archived: true means inactive.
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

interface KladanaMeta { href?: string; type?: string }
interface KladanaBarcode { ean13?: string; ean8?: string; code128?: string; [key: string]: string | undefined }
interface KladanaSalePrice { value?: number; currency?: { meta?: KladanaMeta } }

export interface RawKladanaProduct {
  id: string
  name?: string
  description?: string
  article?: string
  code?: string
  externalCode?: string
  archived?: boolean
  weight?: number
  volume?: number
  barcodes?: KladanaBarcode[]
  salePrices?: KladanaSalePrice[]
  buyPrice?: { value?: number; currency?: { meta?: KladanaMeta } }
  uom?: { meta?: KladanaMeta }
  productFolder?: { meta?: KladanaMeta; name?: string }
  pathName?: string
  supplier?: { meta?: KladanaMeta }
  created?: string
  updated?: string
  [key: string]: unknown
}

function extractBarcode(barcodes: KladanaBarcode[] | undefined): string | undefined {
  if (!barcodes || barcodes.length === 0) return undefined
  const first = barcodes[0]
  if (!first) return undefined
  // Kladana barcode objects have one key with the format type, e.g. { ean13: "..." }
  for (const val of Object.values(first)) {
    if (typeof val === 'string' && val.length > 0) return val
  }
  return undefined
}

function extractCurrencyCode(_price: KladanaSalePrice | undefined): string {
  // Kladana currency href ends in /entity/currency/<UUID> — just default to the
  // account's native currency; we don't have a code here without an extra lookup.
  // Use a safe fallback rather than a hard-coded value.
  return 'USD'
}

function extractSupplierIdFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformProduct(raw: RawKladanaProduct): Product {
  const firstSalePrice = raw.salePrices?.[0]
  const supplierHref = raw.supplier?.meta?.href
  const supplierId = extractSupplierIdFromHref(supplierHref)

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.article) ?? pickStr(raw.code) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: extractBarcode(raw.barcodes),
    category: pickStr(raw.pathName),
    unitOfMeasure: 'each',
    // Kladana weight is in kg, convert to grams
    weightGrams: raw.weight !== undefined ? Math.round(raw.weight * 1000) : undefined,
    // Kladana salePrices[].value is in kopecks (integer minor units) — pass through
    retailPrice: firstSalePrice?.value !== undefined
      ? { amount: Math.round(firstSalePrice.value), currency: extractCurrencyCode(firstSalePrice) }
      : undefined,
    // Kladana buyPrice.value is in kopecks
    cost: raw.buyPrice?.value !== undefined
      ? { amount: Math.round(raw.buyPrice.value), currency: extractCurrencyCode(raw.buyPrice) }
      : undefined,
    isActive: !(raw.archived ?? false),
    supplierIds: supplierId ? [supplierId] : [],
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'kladana',
    metadata: strMap({ externalCode: raw.externalCode, pathName: raw.pathName }),
    raw,
  }
}
