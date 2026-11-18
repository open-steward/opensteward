import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import type { Telephone } from '../../../schema/shared'

export interface CegidContact {
  id: string
  name: string
  registrationNumber: string
  vatNumber: string
  email: string
  phone: string
  addressLine1: string
  postalCode: string
  city: string
  country: string
  isCustomer: boolean
  isSupplier: boolean
  isActive: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: CegidContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.registrationNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: raw.isCustomer ?? false,
    isSupplier: raw.isSupplier ?? false,
    isActive: raw.isActive,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.addressLine1,
      city: raw.city,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
