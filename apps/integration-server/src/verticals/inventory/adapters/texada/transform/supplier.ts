/**
 * Transform Texada CloudLink vendor/supplier records into the canonical
 * Supplier schema.
 *
 * Texada calls these "Vendors" — companies that supply equipment for
 * purchase or parts for maintenance.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawTexadaSupplier {
  /** Vendor/supplier identifier */
  vendorId?: string
  vendorNo?: string
  id?: string
  /** Vendor display name */
  vendorName?: string
  name?: string
  /** Contact details */
  email?: string
  phone?: string
  fax?: string
  /** Default currency code (e.g. "USD", "CAD") */
  currency?: string
  currencyCode?: string
  /** Typical lead time in days */
  leadTimeDays?: number
  leadTime?: number
  /** Active/status flag */
  active?: boolean | string
  status?: string
  /** Address */
  address1?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  /** Tax / registration number */
  taxId?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawTexadaSupplier): Supplier {
  const id = pickStr(raw.vendorId ?? raw.vendorNo ?? raw.id) ?? ''
  const name = pickStr(raw.vendorName ?? raw.name) ?? ''
  const email = pickStr(raw.email)
  const phone = pickStr(raw.phone)
  const defaultCurrency = pickStr(raw.currency ?? raw.currencyCode)
  const defaultLeadTimeDays = pickNum(raw.leadTimeDays ?? raw.leadTime)

  const isActive = raw.active !== undefined
    ? pickBool(raw.active) ?? true
    : (raw.status ?? '').toLowerCase() !== 'inactive'

  return {
    id,
    externalId: id,
    name,
    email,
    phone,
    defaultCurrency,
    defaultLeadTimeDays,
    isActive,
    platform: 'texada',
    metadata: strMap({
      status: raw.status,
      fax: raw.fax,
      taxId: raw.taxId,
      address: raw.address1,
      city: raw.city,
    }),
    raw,
  }
}
