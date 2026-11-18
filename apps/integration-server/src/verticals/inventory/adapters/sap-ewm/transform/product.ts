/**
 * SAP EWM product transform.
 *
 * Source: SAP S/4HANA Product Master OData v2 service (API_PRODUCT_SRV).
 * Entity set: A_Product
 * Key field: Product (= material number, max 40 chars)
 *
 * Relevant fields documented at:
 *   https://api.sap.com/api/API_PRODUCT_SRV/resource
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawSapEwmProduct {
  /** Material number (primary key) */
  Product: string
  /** Short description (language-dependent; returned when $expand=to_Description used) */
  ProductDescription?: string
  /** Product type (FERT, ROH, HALB, HAWA…) */
  ProductType?: string
  /** Base unit of measure (e.g. EA, KG, L) */
  BaseUnit?: string
  /** Gross weight in WeightUnit */
  GrossWeight?: string | number
  /** Weight unit (KG, G, LB…) */
  WeightUnit?: string
  /** Length in SizeUnit */
  Length?: string | number
  /** Width in SizeUnit */
  Width?: string | number
  /** Height in SizeUnit */
  Height?: string | number
  /** Size/dimension unit */
  SizeUnit?: string
  /** EAN / GTIN / barcode */
  ProductStandardID?: string
  /** Material group (coarse category) */
  MaterialGroup?: string
  /** Division */
  Division?: string
  /** Cross-plant status */
  CrossPlantStatus?: string
  /** X = marked for deletion */
  DeletionIndicator?: boolean | string
  /** Creation date as /Date(ms)/ */
  CreationDate?: string
  /** Last change date as /Date(ms)/ */
  LastChangeDate?: string
  [key: string]: unknown
}

/**
 * SAP base-unit-of-measure codes (see `BaseUnit` doc comment above: "e.g.
 * EA, KG, L") mapped to the canonical UnitOfMeasure vocabulary. SAP's unit
 * domain is large and client-configurable; only the codes this adapter's
 * interface documents receiving are mapped. Anything else falls through to
 * `undefined` — the field is optional, so an honest "we don't know" beats
 * inventing a canonical value or passing the raw SAP code through unchanged.
 *
 * Kept local to this adapter rather than shared with sap-inventory: SAP EWM
 * and SAP S/4HANA Product Master are different products, and their unit
 * domains may legitimately diverge even where they overlap today.
 */
const SAP_UOM_TO_CANONICAL: Record<string, string> = {
  EA: 'each',
  KG: 'kg',
  L: 'litre',
  M: 'metre',
}

export function transformProduct(raw: RawSapEwmProduct): Product {
  const isDeleted = pickBool(raw.DeletionIndicator) ?? false
  const baseUnit = pickStr(raw.BaseUnit)?.toUpperCase()

  return {
    id: raw.Product,
    externalId: raw.Product,
    sku: raw.Product,
    name: pickStr(raw.ProductDescription) ?? raw.Product,
    description: undefined,
    upc: pickStr(raw.ProductStandardID),
    brand: undefined,
    category: pickStr(raw.MaterialGroup),
    unitOfMeasure: baseUnit ? SAP_UOM_TO_CANONICAL[baseUnit] : undefined,
    weightGrams: (() => {
      const w = pickNum(raw.GrossWeight)
      if (w === undefined) return undefined
      const unit = (raw.WeightUnit ?? '').toUpperCase()
      if (unit === 'KG') return w * 1_000
      if (unit === 'G') return w
      if (unit === 'LB') return w * 453.592
      return w * 1_000 // default assume KG
    })(),
    dimensionsCm: (() => {
      const l = pickNum(raw.Length)
      const w = pickNum(raw.Width)
      const h = pickNum(raw.Height)
      if (!l && !w && !h) return undefined
      // SAP SizeUnit is usually M; convert to CM
      const unit = (raw.SizeUnit ?? 'M').toUpperCase()
      const factor = unit === 'M' ? 100 : unit === 'MM' ? 0.1 : 1
      return { length: l ? l * factor : undefined, width: w ? w * factor : undefined, height: h ? h * factor : undefined }
    })(),
    retailPrice: undefined,
    isActive: !isDeleted && (raw.CrossPlantStatus ?? '') !== 'KO',
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.CreationDate),
    updatedAt: toIso(raw.LastChangeDate),
    platform: 'sap-ewm',
    metadata: strMap({
      productType: raw.ProductType,
      materialGroup: raw.MaterialGroup,
      division: raw.Division,
      crossPlantStatus: raw.CrossPlantStatus,
    }),
    raw,
  }
}
