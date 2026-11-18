import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface TwentyFourSevenContact {
  id: string
  name: string
  companyName: string
  organizationNumber: string
  email: string
  phone: string
  fax: string
  street: string
  city: string
  postalCode: string
  country: string
  isCustomer: boolean
  isSupplier: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: TwentyFourSevenContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK'), toPhone(raw.fax, 'FAX')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.companyName || undefined,
    taxNumber: raw.organizationNumber || undefined,
    isCustomer: raw.isCustomer,
    isSupplier: raw.isSupplier,
    isActive: true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
