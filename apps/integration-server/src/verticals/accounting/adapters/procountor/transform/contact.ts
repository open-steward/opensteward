import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface ProcountorContact {
  id: number
  name: string
  businessId: string
  email: string
  phone: string
  street: string
  city: string
  zip: string
  country: string
  type: string
  active: boolean
  [key: string]: unknown
}

export function transformContact(raw: ProcountorContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  const phoneEntry = toPhone(raw.phone)
  if (phoneEntry) telephones.push(phoneEntry)

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.businessId || undefined,
    isCustomer: raw.type === 'CUSTOMER',
    isSupplier: raw.type === 'SUPPLIER',
    isActive: raw.active,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
