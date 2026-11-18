/**
 * VTEX Catalog product + SKU → canonical Product / ProductVariant.
 *
 * VTEX separates the catalog into Products (parent entity with name, brand,
 * category, description) and SKUs (purchasable units with price, stock,
 * images, specifications). The adapter fetches the product detail from
 * `GET /api/catalog/pvt/product/{productId}` and each SKU's context from
 * `GET /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}`.
 *
 * VTEX Catalog price fields are in integer minor units in the pricing API;
 * the SKU context endpoint returns `Price` and `ListPrice` in decimal major
 * units (e.g. 109.90). We convert those to minor units.
 *
 * Docs:
 *   https://developers.vtex.com/docs/api-reference/catalog-api
 *   https://developers.vtex.com/vtex-rest-api/reference/catalog-api-get-product
 *   https://developers.vtex.com/vtex-rest-api/reference/catalog-api-get-sku
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw VTEX shapes ──────────────────────────────────────────────────────────

export interface RawVtexProduct {
  Id: number | string
  Name: string
  LinkId?: string | null
  RefId?: string | null
  IsVisible?: boolean
  Description?: string | null
  DescriptionShort?: string | null
  DepartmentId?: number | string | null
  CategoryId?: number | string | null
  BrandId?: number | string | null
  BrandName?: string | null
  Keywords?: string | null
  IsActive?: boolean | null
  Title?: string | null
  MetaTagDescription?: string | null
  SupplierId?: number | string | null
  ShowWithoutStock?: boolean
  AdWordsRemarketingCode?: string | null
  LomadeeCampaignCode?: string | null
  Score?: number | null
  [key: string]: unknown
}

export interface RawVtexSkuImage {
  ImageId?: number | string
  ImageName?: string | null
  ImageText?: string | null
  ImageUrl?: string | null
  ImageLabel?: string | null
  IsMain?: boolean
}

export interface RawVtexSkuSpecification {
  FieldId?: number | string
  FieldName?: string | null
  FieldValueIds?: (number | string)[]
  FieldValues?: string[]
}

/** Shape from GET /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId} */
export interface RawVtexSku {
  Id: number | string
  ProductId?: number | string | null
  ProductName?: string | null
  NameComplete?: string | null
  ComplementName?: string | null
  ProductDescription?: string | null
  ProductRefId?: string | null
  TaxCode?: string | null
  SellerId?: string | null
  IsActive?: boolean | null
  IsTransported?: boolean
  IsInventoried?: boolean
  IsGiftCardRecharge?: boolean
  ImageId?: number | string | null
  DetailUrl?: string | null
  CSCIdentification?: string | null
  Height?: number | null
  Length?: number | null
  Width?: number | null
  WeightKg?: number | null
  RealHeight?: number | null
  RealLength?: number | null
  RealWidth?: number | null
  RealWeightKg?: number | null
  ManufacturerCode?: string | null
  CommercialConditionId?: number | null
  RewardValue?: number | null
  AlternateIds?: Record<string, string | number> | null
  AlternateIdValues?: string[]
  EstimatedDateArrival?: string | null
  MeasurementUnit?: string | null
  UnitMultiplier?: number | null
  InformationSource?: string | null
  ModalType?: string | null
  /** Images array (present in context endpoint). */
  Images?: RawVtexSkuImage[]
  /** Specifications array (context endpoint). */
  SkuSpecifications?: RawVtexSkuSpecification[]
  /** Price in decimal major units (from context endpoint). */
  Price?: number | null
  ListPrice?: number | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(isActive: boolean | null | undefined): ProductStatus | undefined {
  if (isActive == null) return undefined
  return isActive ? 'ACTIVE' : 'ARCHIVED'
}

function mapImage(raw: RawVtexSkuImage, index: number): Image | undefined {
  if (!raw.ImageUrl) return undefined
  return {
    id: raw.ImageId != null ? String(raw.ImageId) : undefined,
    url: raw.ImageUrl,
    alt: raw.ImageText ?? raw.ImageName ?? undefined,
    position: index,
  }
}

function weightUnitFromSku(_sku: RawVtexSku): WeightUnit {
  // VTEX uses kilograms in WeightKg/RealWeightKg; convert to kg as canonical unit.
  return 'kg'
}

export function transformProductVariant(
  sku: RawVtexSku,
  productId: string,
  currency: string = 'BRL',
): ProductVariant {
  const id = String(sku.Id)
  const images = (sku.Images ?? [])
    .map((img, i) => mapImage(img, i))
    .filter((img): img is Image => img != null)

  // SKU context endpoint returns Price/ListPrice in decimal major units.
  const price = sku.Price != null ? majorToMinor(sku.Price, currency) : 0
  const listPrice =
    sku.ListPrice != null ? majorToMinor(sku.ListPrice, currency) : undefined

  const weight =
    sku.RealWeightKg ?? sku.WeightKg ?? undefined

  return {
    id,
    productId,
    sku: sku.AlternateIds?.['Ean'] != null
      ? String(sku.AlternateIds['Ean'])
      : sku.ManufacturerCode ?? undefined,
    title: sku.NameComplete ?? sku.ComplementName ?? undefined,
    price: { amount: price, currency },
    compareAtPrice:
      listPrice != null && listPrice !== price
        ? { amount: listPrice, currency }
        : undefined,
    weight: weight != null ? weight : undefined,
    weightUnit: weight != null ? weightUnitFromSku(sku) : undefined,
    inventoryItemId: id,
    requiresShipping: sku.IsTransported !== false,
    metadata: {
      ...(sku as Record<string, unknown>),
      parentProductId: productId,
      images,
    },
  }
}

export function transformProduct(
  raw: RawVtexProduct,
  skus: RawVtexSku[] = [],
  currency: string = 'BRL',
): Product {
  const productId = String(raw.Id)

  const variants = skus.map((sku) => transformProductVariant(sku, productId, currency))

  // Gather all unique images from SKUs.
  const allImages: Image[] = []
  const seenUrls = new Set<string>()
  for (const sku of skus) {
    for (const img of sku.Images ?? []) {
      if (img.ImageUrl && !seenUrls.has(img.ImageUrl)) {
        seenUrls.add(img.ImageUrl)
        const mapped = mapImage(img, allImages.length)
        if (mapped) allImages.push(mapped)
      }
    }
  }

  return {
    id: productId,
    title: raw.Name,
    description: raw.Description ?? raw.DescriptionShort ?? undefined,
    handle: raw.LinkId ?? undefined,
    status: mapStatus(raw.IsActive),
    vendor: raw.BrandName ?? undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: allImages.length > 0 ? allImages : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → VTEX product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    Name: product.title,
    Description: product.description,
    LinkId: product.handle,
    IsActive: product.status === 'ACTIVE' ? true : product.status === 'ARCHIVED' ? false : undefined,
    BrandName: product.vendor,
  }
}

/** Canonical ProductVariant → VTEX SKU body (for create/update). */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    ProductId: variant.productId,
    NameComplete: variant.title,
    ManufacturerCode: variant.sku,
    WeightKg: variant.weight,
    IsActive: true,
  }
}
