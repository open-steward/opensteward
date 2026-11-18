/**
 * Kinaxis Maestro Part → Product transform.
 *
 * The Maestro REST API represents inventory items as "Parts" (table: Part).
 * Field names follow the RapidResponse/Maestro schema conventions:
 *   id         — system-generated composite key (partNumber:site or standalone)
 *   partNumber — user-visible SKU / item number
 *   description
 *   uom        — unit of measure code (e.g. "EA", "CS")
 *   partType   — "Manufactured" | "Purchased" | "Subcontracted" | etc.
 *   status     — "Active" | "Inactive" | "Obsolete"
 *   unitCost   — standard cost in the tenant currency (minor units not used by Kinaxis; keep as-is)
 *   weight     — in kg (Kinaxis stores kg)
 *   dimensions — not typically exposed in REST response; omit
 *   primarySupplierId
 *   creationDate / lastModifiedDate — ISO-8601 strings
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface RawKinaxisPart {
  id: string
  partNumber?: string
  description?: string
  uom?: string
  partType?: string
  status?: string
  /** Standard cost in tenant default currency. */
  unitCost?: number
  /** Weight in kg. */
  weightKg?: number
  /** Primary supplier part identifier. */
  primarySupplierId?: string
  /** Additional supplier references. */
  supplierParts?: Array<{ supplierId: string }>
  creationDate?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawKinaxisPart): Product {
  const suppliers: string[] = []
  if (raw.primarySupplierId) suppliers.push(raw.primarySupplierId)
  for (const s of raw.supplierParts ?? []) {
    if (s.supplierId && !suppliers.includes(s.supplierId)) suppliers.push(s.supplierId)
  }

  const isActive = raw.status ? (raw.status.toLowerCase() === 'active') : true

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.partNumber) ?? raw.id,
    name: pickStr(raw.description) ?? pickStr(raw.partNumber) ?? raw.id,
    description: pickStr(raw.description),
    unitOfMeasure: pickStr(raw.uom) ?? 'each',
    // Kinaxis stores weight in kg; schema expects grams.
    weightGrams: raw.weightKg !== undefined ? raw.weightKg * 1000 : undefined,
    isActive,
    supplierIds: suppliers,
    createdAt: toIso(raw.creationDate),
    updatedAt: toIso(raw.lastModifiedDate),
    platform: 'kinaxis',
    metadata: strMap({ partType: raw.partType, status: raw.status }),
    raw,
  }
}
