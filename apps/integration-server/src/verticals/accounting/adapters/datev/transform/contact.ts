/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface DatevContact {
  id: string | number
  name: string
  email_address: string
  phone: string
  street: string
  zip_code: string
  city: string
  country_code: string
  tax_number: string
  is_customer: boolean
  is_supplier: boolean
  [key: string]: unknown
}

export function transformContact(raw: DatevContact): Contact {
  const emails = toWorkEmail(raw.email_address)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.tax_number || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      postalCode: raw.zip_code,
      city: raw.city,
      country: raw.country_code,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
