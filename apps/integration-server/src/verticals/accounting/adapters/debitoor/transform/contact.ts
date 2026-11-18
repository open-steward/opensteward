/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface DebitoorContact {
  id: string
  name: string
  ciNumber: string
  email: string
  phone: string
  address: string
  city: string
  zipCode: string
  countryCode: string
  isCustomer: boolean
  isSupplier: boolean
  isActive: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: DebitoorContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.ciNumber || undefined,
    isCustomer: raw.isCustomer,
    isSupplier: raw.isSupplier,
    isActive: raw.isActive,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zipCode,
      country: raw.countryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
