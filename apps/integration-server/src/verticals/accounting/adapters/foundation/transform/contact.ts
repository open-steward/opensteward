/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface FoundationContact {
  VendorId: string
  Name: string
  ContactType: string
  Email: string
  Phone: string
  Address1: string
  Address2: string
  City: string
  State: string
  ZipCode: string
  Country: string
  IsActive: boolean
  [key: string]: unknown
}

export function transformContact(raw: FoundationContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const phone = toPhone(raw.Phone, 'WORK')
  const telephones = phone ? [phone] : []

  const isSupplier = raw.ContactType === 'Vendor' || raw.ContactType === 'Subcontractor'
  const isCustomer = raw.ContactType === 'Owner'

  return {
    id: String(raw.VendorId),
    name: raw.Name || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.IsActive ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address1,
      address2: raw.Address2,
      city: raw.City,
      region: raw.State,
      postalCode: raw.ZipCode,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
