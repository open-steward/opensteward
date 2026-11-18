import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface TwinfieldContact {
  code: string
  name: string
  type: string
  shortName: string
  vatNumber: string
  website: string
  email: string
  phone: string
  fax: string
  addressLine1: string
  addressLine2: string
  city: string
  postcode: string
  country: string
  [key: string]: unknown
}

export function transformContact(raw: TwinfieldContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK'), toPhone(raw.fax, 'FAX')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.code,
    name: raw.name || undefined,
    companyName: raw.shortName || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: raw.type === 'DEB',
    isSupplier: raw.type === 'CRE',
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.addressLine1,
      address2: raw.addressLine2,
      city: raw.city,
      postalCode: raw.postcode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
