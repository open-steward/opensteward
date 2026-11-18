/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface Unit4Contact {
  supplierId?: string | number
  debtorId?: string | number
  name: string
  organizationNumber?: string
  vatNumber?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    country?: string
    [key: string]: unknown
  }
  isSupplier?: boolean
  isCustomer?: boolean
  [key: string]: unknown
}

export function transformContact(raw: Unit4Contact): Contact {
  const id = raw.supplierId
    ? `supp_${raw.supplierId}`
    : raw.debtorId
      ? `debt_${raw.debtorId}`
      : String(raw.organizationNumber ?? '')
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id,
    name: raw.name || undefined,
    identification: raw.organizationNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: raw.isCustomer ?? !!raw.debtorId,
    isSupplier: raw.isSupplier ?? !!raw.supplierId,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.address
      ? toAddress({
          address1: raw.address.street,
          city: raw.address.city,
          postalCode: raw.address.postalCode,
          country: raw.address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
