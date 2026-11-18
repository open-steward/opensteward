/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface AccountEdgeContact {
  id: string
  name: string
  email: string
  phone: string
  company_name: string
  is_customer: boolean
  is_supplier: boolean
  address: {
    line1: string
    city: string
    state: string
    zip: string
    country: string
  } | null
  [key: string]: unknown
}

export function transformContact(raw: AccountEdgeContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(Boolean) as NonNullable<
    ReturnType<typeof toPhone>
  >[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.company_name || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.address
      ? toAddress({
          address1: raw.address.line1,
          city: raw.address.city,
          region: raw.address.state,
          postalCode: raw.address.zip,
          country: raw.address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
