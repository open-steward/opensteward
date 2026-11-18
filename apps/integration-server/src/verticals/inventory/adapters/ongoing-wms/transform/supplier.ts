/**
 * Transform Ongoing WMS supplier info → canonical Supplier.
 *
 * The Goods Owner REST API does not have a dedicated /suppliers endpoint.
 * Supplier data surfaces in article responses via the supplierInfo sub-object.
 * We synthesise Supplier records from those embedded objects.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawOngoingWmsSupplier {
  /** supplierNumber is the goods-owner-assigned supplier identifier */
  supplierNumber?: string
  supplierName?: string
  supplierArticleNumber?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawOngoingWmsSupplier): Supplier {
  const id = pickStr(raw.supplierNumber) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.supplierName) ?? '',
    email: undefined,
    phone: undefined,
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'ongoing-wms',
    metadata: strMap({ supplierArticleNumber: raw.supplierArticleNumber }),
    raw,
  }
}
