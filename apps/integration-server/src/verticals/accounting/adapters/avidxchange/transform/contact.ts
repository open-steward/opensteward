/**
 * AvidXchange vendor/supplier transform → canonical Contact.
 *
 * AvidXchange is an AP-only platform. The "contacts" equivalent is the
 * vendor (supplier) record. Every vendor is isSupplier=true, isCustomer=false.
 *
 * Key vendor fields (camelCase on the wire):
 *   vendorId, vendorCode, vendorName, taxId, isActive,
 *   email, phone, fax,
 *   address1, address2, city, state, postalCode, country,
 *   remittanceAddress { address1, address2, city, state, postalCode, country },
 *   currency, paymentMethod, createdDate, modifiedDate
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface AvidXchangeVendorAddress {
  address1?: string
  address2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface AvidXchangeVendor {
  vendorId: string
  vendorCode?: string
  vendorName?: string
  taxId?: string
  isActive?: boolean
  email?: string
  phone?: string
  fax?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  remittanceAddress?: AvidXchangeVendorAddress
  currency?: string
  paymentMethod?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformVendor(raw: AvidXchangeVendor): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  return {
    id: raw.vendorId,
    name: raw.vendorName || undefined,
    identification: raw.vendorCode || undefined,
    taxNumber: raw.taxId || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.isActive !== undefined ? raw.isActive : undefined,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    shippingAddress: raw.remittanceAddress
      ? toAddress({
          address1: raw.remittanceAddress.address1,
          address2: raw.remittanceAddress.address2,
          city: raw.remittanceAddress.city,
          region: raw.remittanceAddress.state,
          postalCode: raw.remittanceAddress.postalCode,
          country: raw.remittanceAddress.country,
        })
      : undefined,
    createdAt: raw.createdDate ? new Date(raw.createdDate) : undefined,
    updatedAt: raw.modifiedDate ? new Date(raw.modifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
