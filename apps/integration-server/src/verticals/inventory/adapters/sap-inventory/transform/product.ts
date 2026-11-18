/**
 * Transform SAP API_PRODUCT_SRV A_Product entity → canonical Product.
 *
 * Key fields from SAP OData v2 Product entity:
 *   Product, ProductType, BaseUnit, GrossWeight, WeightUnit,
 *   NetWeight, ProductGroup, Division, IndustrySector,
 *   IsMarkedForDeletion, CreationDate, LastChangeDate,
 *   to_Description (nav) → Language + ProductDescription,
 *   to_ProductPlant (nav) → per-plant data.
 *
 * Reference: https://api.sap.com/api/API_PRODUCT_SRV/resource
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/** Inline description nav-prop (expanded via $expand=to_Description) */
interface SapProductDescription {
  Language?: string
  ProductDescription?: string
  [key: string]: unknown
}

/**
 * Raw SAP A_Product entity as returned by API_PRODUCT_SRV.
 * Only fields used in the transform are typed; the rest fall into [key: string].
 */
export interface RawSapProduct {
  /** SAP material/product number — primary key */
  Product: string
  /** FERT, HAWA, ROH, etc. */
  ProductType?: string
  /** Base unit of measure (EA, KG, L, M, …) */
  BaseUnit?: string
  /** Cross-plant material status */
  CrossPlantStatus?: string
  /** Gross weight in WeightUnit */
  GrossWeight?: string | number
  WeightUnit?: string
  /** Net weight */
  NetWeight?: string | number
  /** Material group / product group */
  ProductGroup?: string
  /** Division */
  Division?: string
  /** Industry sector */
  IndustrySector?: string
  /** Soft-delete flag */
  IsMarkedForDeletion?: boolean | string
  /** Creation date — SAP JSON Date or ISO string */
  CreationDate?: string
  LastChangeDate?: string
  /** Expanded descriptions */
  to_Description?: { results?: SapProductDescription[] } | SapProductDescription
  [key: string]: unknown
}

/**
 * SAP base-unit-of-measure codes (see `BaseUnit` doc comment above: "EA, KG,
 * L, M, …") mapped to the canonical UnitOfMeasure vocabulary. SAP's unit
 * domain is large and client-configurable; only the codes this adapter's
 * interface documents receiving are mapped. Anything else falls through to
 * `undefined` — the field is optional, so an honest "we don't know" beats
 * inventing a canonical value or passing the raw SAP code through unchanged.
 */
const SAP_UOM_TO_CANONICAL: Record<string, string> = {
  EA: 'each',
  KG: 'kg',
  L: 'litre',
  M: 'metre',
}

/** Convert SAP weight to grams (rough: assume KG unless unit is G or LB) */
function toGrams(weight: string | number | undefined, unit: string | undefined): number | undefined {
  const w = typeof weight === 'string' ? parseFloat(weight) : weight
  if (w === undefined || Number.isNaN(w as number)) return undefined
  const u = (unit ?? 'KG').toUpperCase()
  if (u === 'G') return w
  if (u === 'LB' || u === 'LBS') return Math.round((w as number) * 453.592)
  // Default: KG
  return Math.round((w as number) * 1_000)
}

/** Pick the English (or first) description from the expanded nav-prop */
function pickDescription(raw: RawSapProduct): string | undefined {
  const nav = raw.to_Description
  if (!nav) return undefined
  let list: SapProductDescription[]
  if ('results' in (nav as object) && Array.isArray((nav as { results: unknown }).results)) {
    list = (nav as { results: SapProductDescription[] }).results
  } else {
    list = [nav as SapProductDescription]
  }
  const en = list.find((d) => d.Language === 'EN' || d.Language === 'en')
  const first = list[0]
  return pickStr((en ?? first)?.ProductDescription)
}

export function transformProduct(raw: RawSapProduct): Product {
  const isDeleted = pickBool(raw.IsMarkedForDeletion) ?? false
  const baseUnit = pickStr(raw.BaseUnit)?.toUpperCase()

  return {
    id: raw.Product,
    externalId: raw.Product,
    sku: pickStr(raw.Product) ?? '',
    name: pickDescription(raw) ?? pickStr(raw.Product) ?? '',
    description: undefined,
    upc: undefined,
    brand: undefined,
    category: pickStr(raw.ProductGroup),
    unitOfMeasure: baseUnit ? SAP_UOM_TO_CANONICAL[baseUnit] : undefined,
    weightGrams: toGrams(raw.GrossWeight, raw.WeightUnit),
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive: !isDeleted,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.CreationDate),
    updatedAt: toIso(raw.LastChangeDate),
    platform: 'sap-inventory',
    metadata: strMap({
      productType: raw.ProductType,
      baseUnit: raw.BaseUnit,
      division: raw.Division,
      industrySector: raw.IndustrySector,
      crossPlantStatus: raw.CrossPlantStatus,
      netWeight: raw.NetWeight,
      weightUnit: raw.WeightUnit,
    }),
    raw,
  }
}
