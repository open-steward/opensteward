import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface BillyContact {
  id: string
  name: string
  countryId: string
  street: string
  cityText: string
  stateText: string
  zipcodeText: string
  phone: string
  fax: string
  contactNo: string
  registrationNo: string
  currencyId: string
  isDebitor: boolean
  isCreditor: boolean
  contactPersons: Array<{ email: string }> | null
  [key: string]: unknown
}

export function transformContact(raw: BillyContact): Contact {
  const emails = toWorkEmail(raw.contactPersons?.[0]?.email)
  const telephones = [toPhone(raw.phone, 'WORK'), toPhone(raw.fax, 'FAX')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.registrationNo || undefined,
    isCustomer: raw.isDebitor,
    isSupplier: raw.isCreditor,
    isActive: true,
    currency: raw.currencyId || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.cityText,
      region: raw.stateText,
      postalCode: raw.zipcodeText,
      country: raw.countryId,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
