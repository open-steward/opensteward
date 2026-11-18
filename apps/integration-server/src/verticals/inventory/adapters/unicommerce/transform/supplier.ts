/**
 * Transform Unicommerce vendor → canonical Supplier.
 *
 * Source endpoint:
 *   POST /services/rest/v1/purchase/vendor/createoredit  (write)
 *   Unicommerce does not expose a vendor list/get read API in its public docs,
 *   so vendor data here is extracted from purchase order response (vendorCode,
 *   vendorName, vendorId) and from the vendor create/update payload shape.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawUnicommerceVendor {
  code?: string
  name?: string
  enabled?: boolean
  pan?: string
  gstNumber?: string
  website?: string
  purchaseExpiryPeriod?: number
  billingAddress?: {
    addressLine1?: string
    addressLine2?: string
    city?: string
    stateCode?: string
    pincode?: string
    phone?: string
  }
  partyContacts?: Array<{
    contactType?: string
    name?: string
    email?: string
    phone?: string
  }>
  [key: string]: unknown
}

export function transformSupplier(raw: RawUnicommerceVendor): Supplier {
  const code = pickStr(raw.code) ?? ''
  const primaryContact = raw.partyContacts?.find((c) =>
    (c.contactType ?? '').toUpperCase() === 'PRIMARY',
  ) ?? raw.partyContacts?.[0]

  return {
    id: code,
    externalId: code,
    name: pickStr(raw.name) ?? code,
    email: pickStr(primaryContact?.email),
    phone: pickStr(primaryContact?.phone) ?? pickStr(raw.billingAddress?.phone),
    isActive: raw.enabled !== false,
    platform: 'unicommerce',
    metadata: strMap({
      pan: raw.pan,
      gstNumber: raw.gstNumber,
      website: raw.website,
      purchaseExpiryPeriod: raw.purchaseExpiryPeriod,
    }),
    raw,
  }
}
