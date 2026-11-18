/**
 * Transform ChannelAdvisor product entity -> canonical Product.
 *
 * Key fields (from ChannelAdvisor REST API v1 /Products):
 *   ID, Sku, Title, Description, Brand, MPN, UPC, ASIN, EAN, HarmonizedCode
 *   IsParent, ParentProductID, IsActive, TotalAvailableQuantity
 *   Cost, RetailPrice, CreateDateUtc, UpdateDateUtc
 *   Attributes[] (name/value pairs), DCQuantities[] (per-DC quantities)
 *
 * Schema-firewall: no product images, no supplier banking, no BOM.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawChannelAdvisorDCQuantity {
  ProductID?: number | string
  ProfileID?: number | string
  DistributionCenterID?: number | string
  AvailableQuantity?: number
  [key: string]: unknown
}

export interface RawChannelAdvisorProduct {
  ID: number | string
  ProfileID?: number | string
  Sku?: string
  Title?: string
  Description?: string
  Brand?: string
  Manufacturer?: string
  MPN?: string
  UPC?: string
  EAN?: string
  ASIN?: string
  HarmonizedCode?: string
  IsParent?: boolean
  IsInRelationship?: boolean
  ParentProductID?: number | string
  IsActive?: boolean
  /** 'Parent' | 'Child' | 'Standalone' */
  RelationshipName?: string
  TotalAvailableQuantity?: number
  /** Expanded via $expand=DCQuantities */
  DCQuantities?: RawChannelAdvisorDCQuantity[]
  Cost?: number
  /** RetailPrice (list price) */
  RetailPrice?: number
  Weight?: number
  /** kg or lb depending on account settings */
  WeightUnit?: string
  Height?: number
  Width?: number
  Length?: number
  DimensionUnit?: string
  CreateDateUtc?: string
  UpdateDateUtc?: string
  /** Expanded attribute bag: [{Name, Value}] */
  Attributes?: Array<{ Name?: string; Value?: string }>
  [key: string]: unknown
}

export function transformProduct(raw: RawChannelAdvisorProduct): Product {
  const id = String(raw.ID)

  // Collect supplemental attribute metadata
  const attrMeta: Record<string, string> = {}
  for (const attr of raw.Attributes ?? []) {
    if (attr.Name && attr.Value !== undefined && attr.Value !== null) {
      attrMeta[`attr_${attr.Name}`] = String(attr.Value)
    }
  }

  // Weight: CA returns in lbs by default; convert to grams
  let weightGrams: number | undefined
  if (raw.Weight != null) {
    const unit = (raw.WeightUnit ?? 'LB').toUpperCase()
    weightGrams = unit === 'KG' ? raw.Weight * 1000 : raw.Weight * 453.592
  }

  // Dimensions: CA returns in inches by default; convert to cm (1 in = 2.54 cm)
  let dimensionsCm: { length?: number; width?: number; height?: number } | undefined
  if (raw.Length != null || raw.Width != null || raw.Height != null) {
    const unit = (raw.DimensionUnit ?? 'IN').toUpperCase()
    const factor = unit === 'CM' ? 1 : 2.54
    dimensionsCm = {
      length: raw.Length != null ? raw.Length * factor : undefined,
      width: raw.Width != null ? raw.Width * factor : undefined,
      height: raw.Height != null ? raw.Height * factor : undefined,
    }
  }

  const parentProductId =
    raw.ParentProductID != null ? String(raw.ParentProductID) : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.Sku) ?? '',
    name: pickStr(raw.Title) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.UPC),
    brand: pickStr(raw.Brand) ?? pickStr(raw.Manufacturer),
    category: undefined,
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm,
    retailPrice:
      raw.RetailPrice != null ? { amount: raw.RetailPrice, currency: 'USD' } : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    parentProductId,
    supplierIds: [],
    createdAt: toIso(raw.CreateDateUtc),
    updatedAt: toIso(raw.UpdateDateUtc),
    platform: 'channeladvisor',
    metadata: strMap({
      asin: raw.ASIN,
      ean: raw.EAN,
      mpn: raw.MPN,
      harmonizedCode: raw.HarmonizedCode,
      isParent: raw.IsParent,
      relationshipName: raw.RelationshipName,
      profileId: raw.ProfileID,
      totalAvailableQuantity: raw.TotalAvailableQuantity,
      cost: raw.Cost,
      ...attrMeta,
    }),
    raw,
  }
}
