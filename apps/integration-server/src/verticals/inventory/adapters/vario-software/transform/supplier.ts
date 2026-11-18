/**
 * Transform a VARIO Cloud article-supplier relation
 * (GET /erp/article-suppliers/{id}) into the canonical Supplier schema.
 *
 * VARIO doesn't have a standalone "supplier" resource — suppliers are
 * modelled as account records referenced via ArticleSupplier relations.
 * We surface the accountId as the canonical id and use accountDisplayName
 * as the name.
 *
 * Field mapping:
 *   accountId         → id / externalId
 *   accountDisplayName → name
 *   active            → isActive
 *   deliveryTime      → defaultLeadTimeDays
 *   mainSupplier      → metadata
 *   supplierArticleNumber → metadata
 *   minimumOrderQuantity  → metadata
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawVarioArticleSupplier {
  id?: string | number
  accountId?: string
  accountDisplayName?: string
  articleId?: string
  articleNumber?: string
  active?: boolean
  mainSupplier?: boolean
  supplierArticleNumber?: string
  supplierArticleName?: string
  deliveryTime?: number
  minimumOrderQuantity?: number
  defaultNetPrice?: number
  defaultGrossPrice?: number
  purchaseUnit?: number
  packagingUnit?: number
  dropShippingAllowed?: boolean
  version?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawVarioArticleSupplier): Supplier {
  const id = pickStr(raw.accountId) ?? String(raw.id ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.accountDisplayName) ?? '',
    email: undefined,
    phone: undefined,
    defaultCurrency: undefined,
    defaultLeadTimeDays: pickNum(raw.deliveryTime),
    isActive: pickBool(raw.active) ?? true,
    platform: 'vario-software',
    metadata: strMap({
      mainSupplier: raw.mainSupplier,
      supplierArticleNumber: raw.supplierArticleNumber,
      supplierArticleName: raw.supplierArticleName,
      minimumOrderQuantity: raw.minimumOrderQuantity,
      defaultNetPrice: raw.defaultNetPrice,
      dropShippingAllowed: raw.dropShippingAllowed,
    }),
    raw,
  }
}
