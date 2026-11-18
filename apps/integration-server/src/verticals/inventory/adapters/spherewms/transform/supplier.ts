import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * Raw supplier record from GET /suppliers or GET /supplier/{supplier_code}.
 * Fields sourced from SphereWMS API v2.27.0.
 */
export interface RawSphereWmsSupplier {
  supplier_code: string | number
  client_st_supp?: string
  name?: string
  address_1?: string
  address_2?: string
  address_3?: string
  address_4?: string
  city?: string
  state_province?: string
  zip_code?: string
  country?: string
  contact_name?: string
  telephone_1?: string
  ext_cust_ref?: string
  client_code?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSphereWmsSupplier): Supplier {
  const id = String(raw.supplier_code)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? id,
    email: undefined,
    phone: pickStr(raw.telephone_1),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'spherewms',
    metadata: strMap({
      clientCode: raw.client_code,
      clientStSupp: raw.client_st_supp,
      contactName: raw.contact_name,
      extCustRef: raw.ext_cust_ref,
    }),
    raw,
  }
}
