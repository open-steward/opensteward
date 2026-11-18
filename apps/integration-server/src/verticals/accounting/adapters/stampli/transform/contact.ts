/**
 * Stampli vendor → canonical Contact transform.
 *
 * Stampli is AP-only; all contacts are vendors/suppliers.
 *
 * Wire shape (camelCase JSON):
 *   id, vendorName, vendorCode, taxId, status, email, phone, fax,
 *   address1, address2, city, state, postalCode, country, currency,
 *   createdAt, updatedAt
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface StampliVendor {
  id: string
  vendorName?: string
  vendorCode?: string
  taxId?: string
  status?: string
  email?: string
  phone?: string
  fax?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  currency?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformVendor(raw: StampliVendor): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  return {
    id: raw.id,
    name: raw.vendorName || undefined,
    identification: raw.vendorCode || undefined,
    taxNumber: raw.taxId || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.status ? raw.status.toUpperCase() === 'ACTIVE' : undefined,
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
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
