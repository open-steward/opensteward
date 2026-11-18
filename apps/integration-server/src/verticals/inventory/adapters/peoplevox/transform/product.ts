/**
 * Transform a Peoplevox "Item Types" GetData CSV row into a canonical Product.
 *
 * Template: "Item Types"
 * Key fields from Peoplevox response:
 *   ItemCode, Name, Barcode, Description, ItemGroup, UnitOfMeasure,
 *   BuyPrice, WholesalePrice, RetailPrice, Weight, Height, Width, Depth,
 *   OnHand, Allocated, Available, POQuantityOutstanding,
 *   DefaultSuppliersPartNumber, DefaultLeadTime, HasSerialNumber,
 *   Attribute1..Attribute3, Tags
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawPeoplevoxItemType {
  ItemCode: string
  Name?: string
  Barcode?: string
  Description?: string
  ItemGroup?: string
  UnitOfMeasure?: string
  BuyPrice?: string
  WholesalePrice?: string
  RetailPrice?: string
  Weight?: string
  WeightMeasure?: string
  Height?: string
  Width?: string
  Depth?: string
  DimensionMeasure?: string
  DefaultSuppliersPartNumber?: string
  DefaultLeadTime?: string
  HasSerialNumber?: string
  ReorderPoint?: string
  Tags?: string
  Attribute1?: string
  Attribute2?: string
  Attribute3?: string
  CreatedDate?: string
  LastModifiedDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawPeoplevoxItemType): Product {
  const retailPriceNum = pickNum(raw.RetailPrice)

  return {
    id: raw.ItemCode,
    externalId: raw.ItemCode,
    sku: pickStr(raw.ItemCode) ?? '',
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.Barcode),
    brand: undefined,
    category: pickStr(raw.ItemGroup),
    unitOfMeasure: pickStr(raw.UnitOfMeasure) ?? 'each',
    // Weight in kg from Peoplevox → convert to grams
    weightGrams: raw.Weight ? (pickNum(raw.Weight) ?? 0) * 1000 : undefined,
    dimensionsCm: raw.Height || raw.Width || raw.Depth ? {
      length: pickNum(raw.Depth),
      width: pickNum(raw.Width),
      height: pickNum(raw.Height),
    } : undefined,
    // Amounts stored as minor units (cents). Peoplevox RetailPrice is decimal pounds/dollars.
    retailPrice: retailPriceNum !== undefined
      ? { amount: Math.round(retailPriceNum * 100), currency: 'GBP' }
      : undefined,
    isActive: true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.CreatedDate),
    updatedAt: toIso(raw.LastModifiedDate),
    platform: 'peoplevox',
    metadata: strMap({
      itemGroup: raw.ItemGroup,
      defaultSuppliersPartNumber: raw.DefaultSuppliersPartNumber,
      defaultLeadTime: raw.DefaultLeadTime,
      hasSerialNumber: raw.HasSerialNumber,
      reorderPoint: raw.ReorderPoint,
      tags: raw.Tags,
      attribute1: raw.Attribute1,
      attribute2: raw.Attribute2,
      attribute3: raw.Attribute3,
      buyPrice: raw.BuyPrice,
      wholesalePrice: raw.WholesalePrice,
    }),
    raw,
  }
}
