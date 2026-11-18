/**
 * Transform Extensiv Order Manager vendor response → canonical Supplier.
 *
 * Real API: GET /api/v1/vendors
 * Key fields: vendorId, name, active, supplier, manufacturer, dropshipper,
 *             contactEmail, contactPhone1, contactPhone2, website,
 *             defaultPurchaseOrderFormat, leadTime (via vendorProducts)
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap} from './shared'

export interface RawExtensivVendor {
  vendorId?: number | string | null
  name?: string | null
  active?: boolean | null
  supplier?: boolean | null
  manufacturer?: boolean | null
  dropshipper?: boolean | null
  contactEmail?: string | null
  contactPhone1?: string | null
  contactPhone2?: string | null
  website?: string | null
  fax?: string | null
  defaultPurchaseOrderFormat?: string | null
  defaultIncotermShippingRule?: string | null
  percentageTax?: number | null
  address?: {
    address1?: string | null
    address2?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
    country?: string | null
  } | null
  [key: string]: unknown
}

export function transformSupplier(raw: RawExtensivVendor): Supplier {
  const id = String(raw.vendorId ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.contactEmail),
    phone: pickStr(raw.contactPhone1) ?? pickStr(raw.contactPhone2),
    isActive: pickBool(raw.active) ?? true,
    platform: 'extensiv-order-manager',
    metadata: strMap({
      supplier: raw.supplier,
      manufacturer: raw.manufacturer,
      dropshipper: raw.dropshipper,
      website: raw.website,
      defaultPurchaseOrderFormat: raw.defaultPurchaseOrderFormat,
    }),
    raw,
  }
}
