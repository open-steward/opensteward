/**
 * Transform Infor WMS supplier records.
 *
 * Infor WMS supplier/vendor data is available at /WMS/suppliers.
 * Key fields:
 *   supplierId      — unique vendor identifier
 *   supplierName    — vendor name
 *   emailAddress    — contact email
 *   phoneNumber     — contact phone
 *   currencyCode    — default transaction currency
 *   leadTimeDays    — default procurement lead time
 *   activeFlag      — "Y" / "N"
 *   ownerCode       — owner / company code
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawInforWmsSupplier {
  supplierId: string
  supplierName?: string
  emailAddress?: string
  phoneNumber?: string
  currencyCode?: string
  leadTimeDays?: number | string
  activeFlag?: string | boolean
  ownerCode?: string
  address1?: string
  address2?: string
  city?: string
  stateCode?: string
  countryCode?: string
  postalCode?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawInforWmsSupplier): Supplier {
  return {
    id: raw.supplierId,
    externalId: raw.supplierId,
    name: pickStr(raw.supplierName) ?? raw.supplierId,
    email: pickStr(raw.emailAddress),
    phone: pickStr(raw.phoneNumber),
    defaultCurrency: pickStr(raw.currencyCode),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive: pickBool(raw.activeFlag) ?? ((raw.activeFlag as string) !== 'N'),
    platform: 'infor-wms',
    metadata: strMap({
      ownerCode: raw.ownerCode,
      address1: raw.address1,
      city: raw.city,
      countryCode: raw.countryCode,
    }),
    raw,
  }
}
