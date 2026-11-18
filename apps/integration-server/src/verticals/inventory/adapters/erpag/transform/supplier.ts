/**
 * ERPAG supplier transform.
 *
 * GET /supplier?id={id} response shape:
 * {
 *   supplier: { key, supplier, eMail, taxIdentificationNumber, termsOfPayment }
 *   internationalTrade: boolean
 *   billingAddress: { address1, address2, city, stateProvince, zipCode, country }
 *   contactPerson: []
 *   supplierPriceLists: []
 * }
 *
 * The `key` (= the id) is injected by the adapter before this transform.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawErpagSupplierInfo {
  key?: string
  supplier?: string
  eMail?: string
  taxIdentificationNumber?: string
  termsOfPayment?: string
  [key: string]: unknown
}

export interface RawErpagBillingAddress {
  address1?: string
  address2?: string
  city?: string
  stateProvince?: string
  zipCode?: string
  country?: string
  [key: string]: unknown
}

export interface RawErpagSupplier {
  /** Injected by the adapter from the /suppliers list id. */
  id: string
  supplier?: RawErpagSupplierInfo
  internationalTrade?: boolean
  billingAddress?: RawErpagBillingAddress
  contactPerson?: unknown[]
  supplierPriceLists?: unknown[]
  [key: string]: unknown
}

export function transformSupplier(raw: RawErpagSupplier): Supplier {
  const info = raw.supplier ?? {}
  const addr = raw.billingAddress

  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(info.supplier) ?? '',
    email: pickStr(info.eMail),
    isActive: true,
    platform: 'erpag',
    metadata: strMap({
      taxIdentificationNumber: info.taxIdentificationNumber,
      termsOfPayment: info.termsOfPayment,
      internationalTrade: raw.internationalTrade,
      billingCity: addr?.city,
      billingCountry: addr?.country,
    }),
    raw,
  }
}
