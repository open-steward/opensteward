/**
 * Transform a Shelf.nu asset (GET /api/mobile/assets/:id) to the canonical Product schema.
 *
 * Shelf's primary entity is the "asset" — a tracked physical item with a title,
 * optional category, optional location, custody state, valuation, and custom fields.
 * We map it to Product as the closest inventory equivalent.
 *
 * Valuation is stored as a floating-point decimal by Shelf; we convert to
 * integer minor units (cents) as required by the schema.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawShelfNuAsset {
  id: string
  title: string
  description?: string | null
  status?: string | null
  mainImage?: string | null
  thumbnailImage?: string | null
  availableToBook?: boolean
  valuation?: number | null
  createdAt?: string
  updatedAt?: string
  organizationId?: string
  category?: { id: string; name: string; color?: string } | null
  location?: { id: string; name: string } | null
  custody?: { custodian: { id: string; name: string } } | null
  kit?: { id: string; name: string; status?: string } | null
  tags?: Array<{ id: string; name: string }>
  qrCodes?: Array<{ id: string }>
  organization?: { currency?: string }
  customFields?: Array<{
    id: string
    value: unknown
    customField: { id: string; name: string; type: string; helpText?: string | null; active: boolean }
  }>
  sequentialId?: string | null
  [key: string]: unknown
}

/** Map Shelf asset status enum to a human-readable category string. */
function resolveCategory(raw: RawShelfNuAsset): string | undefined {
  return raw.category?.name ?? undefined
}

export function transformProduct(raw: RawShelfNuAsset): Product {
  // Valuation is a float (e.g. 299.99); convert to integer minor units (cents).
  const valuationMinor = raw.valuation != null ? Math.round(raw.valuation * 100) : undefined
  const currency = raw.organization?.currency ?? 'USD'

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.sequentialId) ?? raw.id,
    name: raw.title,
    description: pickStr(raw.description),
    upc: undefined,
    brand: undefined,
    category: resolveCategory(raw),
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: valuationMinor !== undefined ? { amount: valuationMinor, currency } : undefined,
    isActive: raw.status !== 'ARCHIVED' && (pickBool(raw.availableToBook) ?? true),
    parentProductId: raw.kit?.id,
    supplierIds: [],
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'shelf-nu',
    metadata: strMap({
      status: raw.status,
      categoryId: raw.category?.id,
      locationId: raw.location?.id,
      locationName: raw.location?.name,
      custodianId: raw.custody?.custodian?.id,
      custodianName: raw.custody?.custodian?.name,
      kitId: raw.kit?.id,
      kitName: raw.kit?.name,
      kitStatus: raw.kit?.status,
    }),
    raw,
  }
}
