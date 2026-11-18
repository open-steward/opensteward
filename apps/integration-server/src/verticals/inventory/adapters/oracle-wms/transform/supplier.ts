/**
 * Oracle WMS Cloud — vendor entity → Supplier
 *
 * lgfapi endpoint: GET /wms/lgfapi/v10/entity/vendor/
 *
 * Key vendor fields:
 *   vendor_id        — internal integer PK
 *   vendor_name      — vendor company name
 *   vendor_code      — short identifier code
 *   email            — contact email
 *   phone            — contact phone
 *   currency_code    — default currency (e.g. "USD")
 *   lead_time        — typical lead time in days
 *   status           — "Active" / "Inactive"
 *   company_id       — tenant company FK
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawOracleWmsVendor {
  vendor_id: number | string
  vendor_name?: string
  vendor_code?: string
  email?: string
  phone?: string
  currency_code?: string
  lead_time?: number | string
  status?: string
  company_id?: number | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawOracleWmsVendor): Supplier {
  const id = String(raw.vendor_id)

  return {
    id,
    externalId: id,
    name: pickStr(raw.vendor_name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency_code),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive: (pickStr(raw.status) ?? 'Active').toLowerCase() !== 'inactive',
    platform: 'oracle-wms',
    metadata: strMap({
      vendorCode: raw.vendor_code,
      status: raw.status,
      companyId: raw.company_id,
    }),
    raw,
  }
}
